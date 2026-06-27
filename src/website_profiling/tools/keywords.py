"""
SEO keyword discovery and scoring from on-site content. Uses PostgreSQL crawl data,
extracts candidate keywords, scores and clusters them, and writes to keyword_data.
"""
import json
import re
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import pandas as pd

from ..analysis.text_hygiene import filter_topic_clusters, is_junk_semantic_term

# Default weights: volume 40%, relevance 30%, ctr_est 15%, (1 - difficulty) 15%
DEFAULT_WEIGHTS = {"volume": 0.40, "relevance": 0.30, "ctr_est": 0.15, "ease": 0.15}


def _normalize_token(s: str) -> str:
    """Lowercase and strip punctuation for a single token."""
    s = re.sub(r"[^\w\s]", "", s.lower().strip())
    return s.strip()


def _tokenize(text: str) -> list[str]:
    """Split text into normalized tokens (no empty)."""
    if not text or not isinstance(text, str):
        return []
    tokens = re.findall(r"\b[\w']+\b", text.lower())
    return [_normalize_token(t) for t in tokens if t]


def _ngrams(tokens: list[str], n: int) -> list[str]:
    """Return n-grams as space-joined strings."""
    if n <= 0 or n > len(tokens):
        return []
    return [" ".join(tokens[i : i + n]) for i in range(len(tokens) - n + 1)]


def _tokens_from_top_keywords(raw: Any) -> list[tuple[str, int]]:
    """Parse per-page top_keywords JSON into weighted terms from body copy."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return []
    try:
        items = json.loads(str(raw)) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError, ValueError):
        return []
    if not isinstance(items, list):
        return []
    out: list[tuple[str, int]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        word = str(item.get("word") or "").strip().lower()
        if len(word) < 3 or is_junk_semantic_term(word):
            continue
        count = int(item.get("count") or 1)
        out.append((word, max(1, count)))
    return out


def _slug_tokens(url: str) -> list[str]:
    """Extract path segments as potential keywords (slug words)."""
    parsed = urlparse(url)
    path = (parsed.path or "").strip("/")
    if not path:
        return []
    segments = [s for s in path.split("/") if s and s not in ("html", "php", "asp", "aspx", "jsp")]
    out = []
    for seg in segments:
        words = re.findall(r"\b[\w']+\b", seg.replace("-", " ").replace("_", " ").lower())
        out.extend(words)
    return out


def _add_candidate(
    candidates: dict[str, dict[str, Any]],
    keyword: str,
    url: str,
    *,
    weight: int = 1,
) -> None:
    kw = keyword.strip().lower()
    if len(kw) < 2 or is_junk_semantic_term(kw):
        return
    if kw not in candidates:
        candidates[kw] = {"sources": [], "tokens": _tokenize(kw), "count": 0}
    if url not in candidates[kw]["sources"]:
        candidates[kw]["sources"].append(url)
    candidates[kw]["count"] += max(1, weight)


def extract_candidates_from_df(df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    """
    From crawl DataFrame, extract candidate keywords (1–4 grams) from title, meta_description,
    h1, per-page top_keywords (body copy), and URL slugs.
    heading_sequence is intentionally excluded — it stores tag names (h1,h2), not heading text.
    """
    candidates: dict[str, dict[str, Any]] = {}
    text_cols = ["title", "meta_description", "h1", "heading_text"]
    for _, row in df.iterrows():
        url = str(row.get("url") or "").strip()
        if not url or str(row.get("status", "")).startswith(("4", "5")):
            continue
        all_tokens: list[str] = []
        for col in text_cols:
            if col not in row:
                continue
            val = row.get(col)
            if pd.isna(val):
                continue
            all_tokens.extend(_tokenize(str(val)))
        all_tokens.extend(_slug_tokens(url))
        if "top_keywords" in row.index:
            for word, count in _tokens_from_top_keywords(row.get("top_keywords")):
                _add_candidate(candidates, word, url, weight=count)
        if not all_tokens:
            continue
        for n in range(1, 5):
            for ng in _ngrams(all_tokens, n):
                if len(ng) < 2:
                    continue
                _add_candidate(candidates, ng, url)
    return candidates


def _relevance_tfidf(candidates: dict[str, dict], corpus_size: int) -> dict[str, float]:
    """Simple TF-IDF style: relevance = (count / total_docs) * log(corpus_size / doc_freq)."""
    total_docs = corpus_size or 1
    doc_freq = {k: len(v["sources"]) for k, v in candidates.items()}
    scores: dict[str, float] = {}
    for kw, data in candidates.items():
        df = doc_freq.get(kw, 1)
        idf = 1.0 + (total_docs / max(df, 1)) ** 0.5
        tf = min(1.0, (data["count"] or 0) / max(total_docs, 1))
        scores[kw] = min(1.0, (tf * idf) / 10.0)
    return scores


def score_keywords(
    candidates: dict[str, dict[str, Any]],
    weights: dict[str, float] | None = None,
    corpus_size: int = 0,
) -> list[dict[str, Any]]:
    """
    Score each candidate. Without external data: search_volume and difficulty are estimated;
    relevance from TF-IDF; ctr_est placeholder.
    """
    weights = weights or DEFAULT_WEIGHTS
    relevance_scores = _relevance_tfidf(candidates, corpus_size or len(candidates))
    results: list[dict[str, Any]] = []
    for kw, data in candidates.items():
        if is_junk_semantic_term(kw):
            continue
        raw_vol = (data.get("count") or 0) / max(corpus_size or 1, 1) * 100
        volume = min(1.0, raw_vol)
        difficulty = 50.0
        ease = 1.0 - (difficulty / 100.0)
        relevance = relevance_scores.get(kw, 0.5)
        ctr_est = 0.1
        current_rank = None
        score = (
            weights.get("volume", 0.4) * volume
            + weights.get("relevance", 0.3) * relevance
            + weights.get("ctr_est", 0.15) * ctr_est
            + weights.get("ease", 0.15) * ease
        )
        if len(data.get("sources") or []) > 1:
            action = "internal link"
        elif relevance > 0.7:
            action = "optimize page"
        else:
            action = "create content"
        results.append({
            "keyword": kw,
            "score": round(score, 4),
            "volume": round(volume, 4),
            "difficulty": difficulty,
            "difficulty_estimated": True,
            "relevance": round(relevance, 4),
            "ctr_est": round(ctr_est, 4),
            "current_rank": current_rank,
            "recommended_action": action,
            "source": "site",
            "data_source": "crawl_heuristic",
            "sources_count": len(data.get("sources") or []),
        })
    results.sort(key=lambda x: -x["score"])
    return results


def cluster_keywords(scored: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group similar keywords by shared tokens (simple overlap)."""
    if not scored:
        return []
    clusters: list[set[str]] = []
    kw_to_tokens: dict[str, set[str]] = {}
    for s in scored:
        kw = s.get("keyword") or ""
        kw_to_tokens[kw] = set(_tokenize(kw))
    used = set()
    kw_list = [s["keyword"] for s in scored]
    for s in scored:
        kw = s.get("keyword") or ""
        if is_junk_semantic_term(kw):
            continue
        if kw in used:
            continue
        cluster = {kw}
        used.add(kw)
        tokens = kw_to_tokens.get(kw, set())
        for other in kw_list:
            if other in used:
                continue
            if tokens & kw_to_tokens.get(other, set()):
                cluster.add(other)
                used.add(other)
                tokens |= kw_to_tokens.get(other, set())
        clusters.append(cluster)
    out: list[dict[str, Any]] = []
    score_by_kw = {s["keyword"]: s["score"] for s in scored}
    for cluster in clusters:
        if not cluster:
            continue
        top_kw = max(cluster, key=lambda k: score_by_kw.get(k, 0))
        scores_in = [score_by_kw.get(k, 0) for k in cluster]
        cluster_score = sum(scores_in) / len(scores_in) if scores_in else 0
        out.append({
            "top_keyword": top_kw,
            "cluster_score": round(cluster_score, 4),
            "keywords": sorted(cluster),
        })
    out.sort(key=lambda x: -x["cluster_score"])
    return out


def _load_crawl_from_db() -> pd.DataFrame:
    from ..db import db_session, get_latest_crawl_run_id, read_crawl

    with db_session() as conn:
        run_id = get_latest_crawl_run_id(conn)
        return read_crawl(conn, run_id)


def run_keyword_pipeline(
    base_url: str,
    config: dict[str, str] | None = None,
    max_pages: int = 200,
) -> dict[str, Any]:
    """
    Run crawl (or load latest from PostgreSQL), extract and score keywords, cluster.
    Writes keyword_data to PostgreSQL. Returns summary dict.
    """
    config = config or {}
    from ..config import get_list

    exclude_urls = get_list(config, "crawl_exclude_urls", sep=",")
    df = _load_crawl_from_db()

    if df.empty:
        from ..crawl.crawler import run_crawler

        run_crawler(
            start_url=base_url,
            max_pages=max_pages,
            concurrency=6,
            timeout=12,
            ignore_robots=False,
            allow_external=False,
            max_depth=6,
            polite_delay=0.2,
            store_outlinks=False,
            output_csv=None,
            output_db=True,
            show_progress=True,
            exclude_urls=exclude_urls if exclude_urls else None,
        )
        df = _load_crawl_from_db()

    if df.empty:
        return {
            "human_summary": "No crawl data; no keywords extracted.",
            "quick_wins": [],
            "high_value": [],
        }

    candidates = extract_candidates_from_df(df)
    corpus_size = len(df)
    weights = DEFAULT_WEIGHTS
    scored = score_keywords(candidates, weights=weights, corpus_size=corpus_size)
    clusters = filter_topic_clusters(cluster_keywords(scored))

    semantic_clusters: list[dict[str, Any]] = []
    try:
        from ..llm_config import load_llm_config_from_db, llm_is_enabled

        llm_cfg = load_llm_config_from_db()
        if llm_is_enabled(llm_cfg) and str(llm_cfg.get("llm_enable_keyword_clusters", "")).lower() in (
            "true",
            "1",
            "yes",
        ):
            try:
                from ..ai_service_client import cluster_keywords_llm

                top_kw = [
                    s["keyword"]
                    for s in scored[:200]
                    if s.get("keyword") and not is_junk_semantic_term(str(s["keyword"]))
                ]
                semantic_clusters = cluster_keywords_llm(top_kw, llm_cfg)
            except Exception as e:
                print(f"Semantic keywords skipped: {e}", file=sys.stderr)
    except Exception:
        pass

    ts = datetime.now(timezone.utc).isoformat()

    quick_wins = [s for s in scored if s.get("difficulty", 100) < 60][:10]
    high_value = [s for s in scored if (s.get("volume") or 0) >= 0.5][:10]
    if not high_value:
        high_value = scored[:10]
    summary_lines = [
        "Quick-wins (high score, lower difficulty): " + (", ".join([x["keyword"] for x in quick_wins[:5]]) or "none"),
        "High-value targets (volume): " + (", ".join([x["keyword"] for x in high_value[:5]]) or "none"),
    ]
    human_summary = " ".join(summary_lines)

    try:
        from ..db.storage import db_session as _db
        from ..integrations.google.keyword_store import write_keyword_data

        rows_for_db = [{**r, "sources": ["site"]} for r in scored]
        blob = {
            "fetched_at": ts,
            "total_keywords": len(rows_for_db),
            "rows": rows_for_db,
            "source": "site",
            "clusters": clusters,
            "clusters_semantic": semantic_clusters,
            "config": {"url": base_url, "weights": weights, "data_sources": ["site"]},
        }
        from ..commands.config_resolve import resolve_property_id_from_cfg

        with _db() as conn:
            property_id = resolve_property_id_from_cfg(config, conn)
            if property_id is None:
                raise RuntimeError(
                    "property_id required for keyword_data. Set start_url in pipeline config."
                )
            blob["property_id"] = property_id
            write_keyword_data(conn, blob, property_id=property_id)
        print("  Keywords stored in PostgreSQL (keyword_data).", flush=True)
    except Exception as e:
        print(f"  Warning: could not write keyword_data to database: {e}", file=sys.stderr)

    return {
        "human_summary": human_summary,
        "quick_wins": quick_wins[:10],
        "high_value": high_value[:10],
        "timestamp": ts,
    }


def main(
    base_url: str,
    config: dict[str, str] | None = None,
) -> int:
    """Run keyword pipeline and print summary. Returns 0 on success."""
    config = config or {}
    try:
        max_pages = int((config or {}).get("keyword_max_pages") or 0) or 200
        summary = run_keyword_pipeline(
            base_url=base_url,
            config=config,
            max_pages=max_pages,
        )
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1
    print(summary.get("human_summary", ""))
    return 0
