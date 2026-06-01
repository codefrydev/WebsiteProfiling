"""LLM-backed content enrichment (UI-configured via llm_config table)."""
from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter
from typing import Any, Optional

import pandas as pd

from ..analysis.text import normalize_fingerprint_text
from ..llm_config import llm_is_enabled
from .base import get_llm_client
from .prompts import (
    KEYPHRASES_SYSTEM,
    KEYWORD_CLUSTER_SYSTEM,
    NER_SYSTEM,
    PROMPT_VERSION,
    SIMILAR_SYSTEM,
)

LLM_INSTALL_HINT = "Install LLM dependencies: pip install -r requirements-llm.txt"


def _cfg_bool(cfg: dict[str, str] | None, key: str, default: bool = False) -> bool:
    if not cfg:
        return default
    return str(cfg.get(key, default)).lower() in ("true", "1", "yes")


def _cfg_int(cfg: dict[str, str] | None, key: str, default: int) -> int:
    if not cfg:
        return default
    raw = cfg.get(key)
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def _html_success_df(df: pd.DataFrame, max_pages: int) -> pd.DataFrame:
    success = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    if "content_type" in success.columns:
        success = success[success["content_type"].fillna("").str.contains("text/html", case=False, na=False)]
    return success.head(max_pages)


def _page_batch_items(df: pd.DataFrame, max_pages: int) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for _, row in _html_success_df(df, max_pages).iterrows():
        u = str(row.get("url") or "").strip().rstrip("/")
        text = normalize_fingerprint_text(row)
        if not u or len(text) < 40:
            continue
        items.append({"url": u, "text": text[:4000]})
    return items


def _cache_key(task: str, model: str, payload: str) -> str:
    h = hashlib.sha256(f"{PROMPT_VERSION}:{task}:{model}:{payload}".encode()).hexdigest()
    return h


def _read_cache(db_path: Optional[str], key: str) -> Optional[dict[str, Any]]:
    if not db_path or not os.path.isfile(db_path):
        return None
    try:
        from ..db import db_session, init_schema
        from ..db.storage import read_llm_cache

        with db_session(db_path) as conn:
            init_schema(conn)
            raw = read_llm_cache(conn, key)
            if raw:
                return json.loads(raw)
    except Exception:
        pass
    return None


def _write_cache(db_path: Optional[str], key: str, data: dict[str, Any]) -> None:
    if not db_path:
        return
    try:
        from ..db import db_session, init_schema
        from ..db.storage import write_llm_cache

        with db_session(db_path) as conn:
            init_schema(conn)
            write_llm_cache(conn, key, json.dumps(data))
    except Exception:
        pass


def _call_cached(
    client: Any,
    task: str,
    system: str,
    user_payload: dict[str, Any],
    cfg: dict[str, str],
    db_path: Optional[str],
) -> dict[str, Any]:
    model = (cfg.get("llm_model") or cfg.get("llm_provider") or "").strip()
    payload_str = json.dumps(user_payload, sort_keys=True)
    ck = _cache_key(task, model, payload_str)
    cached = _read_cache(db_path, ck)
    if cached is not None:
        return cached
    result = client.complete_json(system, json.dumps(user_payload))
    _write_cache(db_path, ck, result)
    return result


def aggregate_ner_site_summary(spacy_by_url: dict[str, dict[str, Any]]) -> dict[str, Any]:
    label_totals: Counter[str] = Counter()
    total_entities = 0
    for _u, info in (spacy_by_url or {}).items():
        if not isinstance(info, dict):
            continue
        total_entities += int(info.get("entity_count") or 0)
        for pair in info.get("top_entity_labels") or []:
            if isinstance(pair, (list, tuple)) and len(pair) >= 2:
                label_totals[str(pair[0])] += int(pair[1])
    return {
        "label_counts": dict(label_totals.most_common(40)),
        "pages_with_ner": len(spacy_by_url or {}),
        "total_entities": total_entities,
    }


def _run_ner(
    client: Any,
    items: list[dict[str, str]],
    cfg: dict[str, str],
    db_path: Optional[str],
) -> dict[str, dict[str, Any]]:
    batch_size = max(1, _cfg_int(cfg, "llm_batch_size", 5))
    out: dict[str, dict[str, Any]] = {}
    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        data = _call_cached(client, "ner", NER_SYSTEM, {"pages": batch}, cfg, db_path)
        for p in data.get("pages") or []:
            u = str(p.get("url") or "").strip().rstrip("/")
            if not u:
                continue
            labels = p.get("top_entity_labels") or []
            out[u] = {
                "entity_count": int(p.get("entity_count") or 0),
                "top_entity_labels": labels,
            }
    return out


def _run_keyphrases(
    client: Any,
    items: list[dict[str, str]],
    cfg: dict[str, str],
    db_path: Optional[str],
) -> dict[str, dict[str, Any]]:
    batch_size = max(1, _cfg_int(cfg, "llm_batch_size", 5))
    out: dict[str, dict[str, Any]] = {}
    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        data = _call_cached(client, "keyphrases", KEYPHRASES_SYSTEM, {"pages": batch}, cfg, db_path)
        for p in data.get("pages") or []:
            u = str(p.get("url") or "").strip().rstrip("/")
            if not u:
                continue
            phrases = p.get("phrases") or []
            pairs = [[str(x[0]), float(x[1])] for x in phrases if isinstance(x, (list, tuple)) and len(x) >= 2]
            out[u] = {"phrases": pairs}
    return out


def _run_similar_internal(
    client: Any,
    items: list[dict[str, str]],
    cfg: dict[str, str],
    db_path: Optional[str],
) -> dict[str, list[dict[str, Any]]]:
    top_k = min(_cfg_int(cfg, "llm_similar_top_k", 5) or 5, 15)
    all_urls = [x["url"] for x in items]
    out: dict[str, list[dict[str, Any]]] = {}
    batch_size = max(1, min(_cfg_int(cfg, "llm_batch_size", 5), 3))
    for i in range(0, len(items), batch_size):
        batch = items[i : i + batch_size]
        payload = {
            "pages": batch,
            "candidate_urls": all_urls[:80],
            "top_k": top_k,
        }
        data = _call_cached(client, "similar", SIMILAR_SYSTEM, payload, cfg, db_path)
        for p in data.get("pages") or []:
            u = str(p.get("url") or "").strip().rstrip("/")
            if not u:
                continue
            sim = []
            for s in (p.get("similar") or [])[:top_k]:
                if isinstance(s, dict) and s.get("url"):
                    sim.append({"url": str(s["url"]), "score": round(float(s.get("score") or 0), 4)})
            if sim:
                out[u] = sim
    return out


def cluster_keywords_llm(
    keywords: list[str],
    cfg: dict[str, str] | None,
    db_path: Optional[str] = None,
) -> list[dict[str, Any]]:
    if not keywords or not cfg or not llm_is_enabled(cfg):
        return []
    if not _cfg_bool(cfg, "llm_enable_keyword_clusters", False):
        return []
    kws = keywords[:200]
    if len(kws) < 2:
        return []
    try:
        client = get_llm_client(cfg)
        data = _call_cached(
            client,
            "kw_clusters",
            KEYWORD_CLUSTER_SYSTEM,
            {"keywords": kws},
            cfg,
            db_path,
        )
        clusters = data.get("clusters") or []
        out: list[dict[str, Any]] = []
        for c in clusters:
            if not isinstance(c, dict):
                continue
            words = c.get("keywords") or []
            if len(words) < 2:
                continue
            out.append(
                {
                    "top_keyword": str(c.get("top_keyword") or words[0]),
                    "keywords": sorted(str(w) for w in words),
                    "cluster_score": round(float(c.get("cluster_score") or 0.9), 4),
                }
            )
        out.sort(key=lambda x: -x["cluster_score"])
        return out
    except Exception as e:
        raise RuntimeError(str(e)) from e


def run_llm_enrichment(
    df: pd.DataFrame,
    cfg: dict[str, str] | None,
    db_path: Optional[str] = None,
) -> dict[str, Any]:
    bundle: dict[str, Any] = {
        "spacy_by_url": {},
        "similar_internal_by_url": {},
        "ner_site_summary": {},
        "keyphrases_by_url": {},
        "ml_errors": [],
    }
    if df.empty or not cfg or not llm_is_enabled(cfg):
        return bundle

    max_pages = _cfg_int(cfg, "llm_max_pages", 60) or 60
    items = _page_batch_items(df, max_pages)
    if not items:
        return bundle

    try:
        client = get_llm_client(cfg)
    except Exception as e:
        bundle["ml_errors"].append(str(e))
        return bundle

    if _cfg_bool(cfg, "llm_enable_ner", True):
        try:
            bundle["spacy_by_url"] = _run_ner(client, items, cfg, db_path)
        except Exception as e:
            bundle["ml_errors"].append(f"LLM NER: {e}")

    if _cfg_bool(cfg, "llm_enable_keyphrases", True):
        try:
            bundle["keyphrases_by_url"] = _run_keyphrases(client, items, cfg, db_path)
        except Exception as e:
            bundle["ml_errors"].append(f"LLM keyphrases: {e}")

    if _cfg_bool(cfg, "llm_enable_similar_internal", True):
        try:
            bundle["similar_internal_by_url"] = _run_similar_internal(client, items, cfg, db_path)
        except Exception as e:
            bundle["ml_errors"].append(f"LLM similar pages: {e}")

    bundle["ner_site_summary"] = aggregate_ner_site_summary(bundle.get("spacy_by_url") or {})
    return bundle
