"""HTTP client for AiService — replaces direct Python LLM imports during report build."""
from __future__ import annotations

import json
import os
from typing import Any

import httpx
import pandas as pd

from .llm_config import llm_is_enabled, load_llm_config_from_db


def _ai_base_url() -> str:
    return (os.environ.get("AI_SERVICE_URL") or "http://127.0.0.1:8092").strip().rstrip("/")


def _post(path: str, payload: dict[str, Any], *, timeout: float = 120.0) -> dict[str, Any]:
    url = f"{_ai_base_url()}{path}"
    with httpx.Client(timeout=timeout) as client:
        r = client.post(url, json=payload)
        r.raise_for_status()
        data = r.json()
        return data if isinstance(data, dict) else {}


def _page_items_from_df(df: pd.DataFrame, max_pages: int) -> list[dict[str, Any]]:
    if df.empty:
        return []
    rows = df.head(max_pages).to_dict(orient="records")
    items: list[dict[str, Any]] = []
    for row in rows:
        url = str(row.get("url") or "").strip()
        if not url:
            continue
        items.append(
            {
                "url": url,
                "title": str(row.get("title") or ""),
                "text": str(row.get("text") or row.get("body_text") or "")[:8000],
            }
        )
    return items


def run_llm_enrichment(df: pd.DataFrame, cfg: dict[str, str] | None) -> dict[str, Any]:
    bundle: dict[str, Any] = {
        "spacy_by_url": {},
        "similar_internal_by_url": {},
        "ner_site_summary": {},
        "keyphrases_by_url": {},
        "ml_errors": [],
    }
    cfg = cfg or load_llm_config_from_db()
    if df.empty or not llm_is_enabled(cfg):
        return bundle

    max_pages = 60
    try:
        max_pages = max(1, int(str(cfg.get("llm_max_pages") or "60")))
    except ValueError:
        pass

    pages = _page_items_from_df(df, max_pages)
    if not pages:
        return bundle

    try:
        out = _post("/internal/enrichment/run", {"pages": pages})
        for key in ("spacy_by_url", "similar_internal_by_url", "ner_site_summary", "keyphrases_by_url", "ml_errors", "llm_meta"):
            if key in out:
                bundle[key] = out[key]
    except Exception as e:
        bundle["ml_errors"].append(str(e))
    return bundle


def cluster_keywords_llm(keywords: list[str], cfg: dict[str, str] | None = None) -> list[dict[str, Any]]:
    cfg = cfg or load_llm_config_from_db()
    if not keywords or not llm_is_enabled(cfg):
        return []
    try:
        out = _post("/internal/enrichment/cluster-keywords", {"keywords": keywords[:200]})
        clusters = out.get("clusters") or []
        return clusters if isinstance(clusters, list) else []
    except Exception as e:
        raise RuntimeError(str(e)) from e


def enrich_top_issues_with_llm(
    categories: list[dict[str, Any]],
    cfg: dict[str, str] | None,
    *,
    gsc_pages: list[dict[str, Any]] | None = None,
) -> None:
    cfg = cfg or load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        return
    try:
        payload = {
            "categories": categories,
            "gsc_pages": gsc_pages or [],
            "refresh": False,
        }
        _post("/internal/enrichment/issue-fixes", payload)
    except Exception:
        pass


def generate_audit_executive_summary(report_data: dict[str, Any], config: dict[str, str] | None) -> dict[str, Any]:
    try:
        return _post("/internal/enrichment/audit-summary", {"report": report_data, "config": config or {}})
    except Exception:
        return {}


def call_ai_api(path: str, payload: dict[str, Any], *, timeout: float = 120.0) -> dict[str, Any]:
    """Call a browser-facing AiService route (e.g. /api/issues/fix-suggestion)."""
    if not path.startswith("/"):
        path = f"/{path}"
    return _post(path, payload, timeout=timeout)


def generate_issue_fix_suggestion(issue: dict[str, Any], *, cfg: dict[str, str] | None = None, refresh: bool = False) -> dict[str, Any]:
    cfg = cfg or load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        return {"ok": False, "error": "AI insights are disabled."}
    body = {**issue, "source": issue.get("source") or "issue", "refresh": refresh}
    try:
        return call_ai_api("/api/issues/fix-suggestion", body)
    except Exception as e:
        return {"ok": False, "error": str(e)}


def run_page_coach(
    page_url: str,
    *,
    refresh: bool = False,
    current_type: str | None = None,
    current_id: int | None = None,
    baseline_type: str | None = None,
    baseline_id: int | None = None,
) -> dict[str, Any]:
    body: dict[str, Any] = {"url": page_url, "refresh": refresh}
    if current_id is not None:
        body["currentId"] = current_id
    if baseline_id is not None:
        body["baselineId"] = baseline_id
    try:
        return call_ai_api("/api/links/page-coach", body)
    except Exception as e:
        return {"ok": False, "error": str(e)}


def complete_json(system: str, user: str, cfg: dict[str, str] | None = None) -> dict[str, Any]:
    _ = cfg
    try:
        return _post("/internal/completion/json", {"system": system, "user": user})
    except Exception as e:
        return {"error": str(e)}


def generate_content_brief(
    keyword: str,
    rows: list[dict[str, Any]] | None = None,
    gaps: list[str] | None = None,
    *,
    use_llm: bool = False,
) -> dict[str, Any]:
    """Heuristic content brief (no LLM)."""
    _ = use_llm
    bullets: list[str] = []
    if gaps:
        bullets.extend(f"Gap: {g}" for g in gaps[:8])
    if rows:
        for row in rows[:5]:
            if isinstance(row, dict):
                kw = row.get("keyword") or row.get("query")
                clicks = row.get("clicks")
                if kw:
                    bullets.append(f"Target cluster around '{kw}'" + (f" ({clicks} clicks)" if clicks else ""))
    if not bullets:
        bullets.append(f"Create comprehensive content targeting '{keyword}'")
    return {
        "keyword": keyword,
        "summary": bullets,
        "provenance": "Estimated",
        "use_llm": False,
    }


def parse_json_response(text: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {"raw": data}
    except json.JSONDecodeError:
        return {"raw": text}
