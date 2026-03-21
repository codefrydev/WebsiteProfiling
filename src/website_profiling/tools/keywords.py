"""
SEO keyword discovery and scoring from on-site content. Crawls site (or uses existing crawl),
extracts candidate keywords from titles, headings, meta, URL slugs; scores and clusters them;
outputs ranked CSV, clusters JSON, and human summary.
"""
import csv
import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import pandas as pd

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


def _slug_tokens(url: str) -> list[str]:
    """Extract path segments as potential keywords (slug words)."""
    parsed = urlparse(url)
    path = (parsed.path or "").strip("/")
    if not path:
        return []
    segments = [s for s in path.split("/") if s and s not in ("html", "php", "asp", "aspx", "jsp")]
    out = []
    for seg in segments:
        # Split on hyphen/underscore and clean
        words = re.findall(r"\b[\w']+\b", seg.replace("-", " ").replace("_", " ").lower())
        out.extend(words)
    return out


def extract_candidates_from_df(df: pd.DataFrame) -> dict[str, dict[str, Any]]:
    """
    From crawl DataFrame, extract candidate keywords (1–4 grams) from title, meta_description,
    h1, heading_sequence, and URL slugs. Returns dict: keyword -> {sources: [urls], tokens, ...}.
    """
    candidates: dict[str, dict[str, Any]] = {}
    text_cols = ["title", "meta_description", "h1", "heading_sequence"]
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
        if not all_tokens:
            continue
        for n in range(1, 5):
            for ng in _ngrams(all_tokens, n):
                if len(ng) < 2:
                    continue
                if ng not in candidates:
                    candidates[ng] = {"sources": [], "tokens": _tokenize(ng), "count": 0}
                if url not in candidates[ng]["sources"]:
                    candidates[ng]["sources"].append(url)
                candidates[ng]["count"] += 1
    return candidates


def _relevance_tfidf(candidates: dict[str, dict], corpus_size: int) -> dict[str, float]:
    """Simple TF-IDF style: relevance = (count / total_docs) * log(corpus_size / doc_freq)."""
    total_docs = corpus_size or 1
    doc_freq = {k: len(v["sources"]) for k, v in candidates.items()}
    max_df = max(doc_freq.values()) or 1
    scores: dict[str, float] = {}
    for kw, data in candidates.items():
        df = doc_freq.get(kw, 1)
        # Higher when term is repeated but not everywhere (idf)
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
    relevance from TF-IDF; ctr_est placeholder. Composite = volume*w_v + relevance*w_r + ctr_est*w_c + (1-difficulty)*w_e.
    """
    weights = weights or DEFAULT_WEIGHTS
    relevance_scores = _relevance_tfidf(candidates, corpus_size or len(candidates))
    results: list[dict[str, Any]] = []
    for kw, data in candidates.items():
        # Estimate volume: no API -> use frequency on site as proxy (normalized 0..1)
        raw_vol = (data.get("count") or 0) / max(corpus_size or 1, 1) * 100
        volume = min(1.0, raw_vol)
        # Difficulty: no API -> middle default so ease = 0.5
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
        # recommended_action: heuristic
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
            "relevance": round(relevance, 4),
            "ctr_est": round(ctr_est, 4),
            "current_rank": current_rank,
            "recommended_action": action,
            "source": "site",
            "sources_count": len(data.get("sources") or []),
        })
    results.sort(key=lambda x: -x["score"])
    return results


def cluster_keywords(scored: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Group similar keywords by shared tokens (simple overlap). Each cluster has
    top keyword (by score), cluster score (average of keyword scores), and list of keywords.
    """
    if not scored:
        return []
    # Build clusters: keywords that share at least one token go together (greedy).
    clusters: list[set[str]] = []
    kw_to_tokens: dict[str, set[str]] = {}
    for s in scored:
        kw = s.get("keyword") or ""
        kw_to_tokens[kw] = set(_tokenize(kw))
    used = set()
    kw_list = [s["keyword"] for s in scored]
    for s in scored:
        kw = s.get("keyword") or ""
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


def run_keyword_pipeline(
    base_url: str,
    output_dir: str,
    config: dict[str, str] | None = None,
    crawl_csv_path: str | None = None,
    max_pages: int = 200,
) -> dict[str, Any]:
    """
    Run crawl (or load existing crawl), extract and score keywords, cluster, write CSV and JSON.
    Returns summary dict with paths and human summary.
    """
    config = config or {}
    from ..config import get_list
    exclude_urls = get_list(config, "crawl_exclude_urls", sep=",")
    os.makedirs(output_dir, exist_ok=True)
    cwd = os.getcwd()

    if crawl_csv_path and os.path.isfile(crawl_csv_path):
        from ..common import load_dataframe
        df = load_dataframe(crawl_csv_path)
    else:
        from ..crawl.crawler import run_crawler
        crawl_out = os.path.join(output_dir, "keyword_crawl.json")
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
            output_csv=crawl_out,
            show_progress=True,
            exclude_urls=exclude_urls if exclude_urls else None,
        )
        from ..common import load_dataframe
        df = load_dataframe(crawl_out)

    if df.empty:
        return {
            "top_keywords_path": None,
            "clusters_path": None,
            "human_summary": "No crawl data; no keywords extracted.",
            "quick_wins": [],
            "high_value": [],
        }

    candidates = extract_candidates_from_df(df)
    corpus_size = len(df)
    weights = DEFAULT_WEIGHTS
    scored = score_keywords(candidates, weights=weights, corpus_size=corpus_size)
    clusters = cluster_keywords(scored)

    semantic_clusters: list[dict[str, Any]] = []
    from ..config import get_bool

    if get_bool(config, "enable_semantic_keywords", False):
        try:
            from ..ml.enrich import cluster_keywords_semantic

            top_kw = [s["keyword"] for s in scored[:200] if s.get("keyword")]
            semantic_clusters = cluster_keywords_semantic(top_kw, config)
        except ImportError as e:
            print(f"Semantic keywords skipped: {e}", file=sys.stderr)

    ts = datetime.now(timezone.utc).isoformat()
    top_path = os.path.join(output_dir, "top_keywords.csv")
    clusters_path = os.path.join(output_dir, "clusters.json")

    with open(top_path, "w", newline="", encoding="utf-8") as f:
        cols = ["keyword", "score", "volume", "difficulty", "relevance", "ctr_est", "current_rank", "recommended_action", "source"]
        w = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        w.writeheader()
        for row in scored:
            w.writerow({k: row.get(k) for k in cols})

    out_meta = {
        "timestamp": ts,
        "config": {"url": base_url, "weights": weights, "data_sources": ["site"]},
        "clusters": clusters,
        "clusters_semantic": semantic_clusters,
    }
    with open(clusters_path, "w", encoding="utf-8") as f:
        json.dump(out_meta, f, indent=2, default=str)

    quick_wins = [s for s in scored if s.get("difficulty", 100) < 60][:10]
    high_value = [s for s in scored if (s.get("volume") or 0) >= 0.5][:10]
    if not high_value:
        high_value = scored[:10]
    summary_lines = [
        "Quick-wins (high score, lower difficulty): " + ", ".join([x["keyword"] for x in quick_wins[:5]]) or "none",
        "High-value targets (volume): " + ", ".join([x["keyword"] for x in high_value[:5]]) or "none",
    ]
    human_summary = " ".join(summary_lines)

    return {
        "top_keywords_path": top_path,
        "clusters_path": clusters_path,
        "human_summary": human_summary,
        "quick_wins": quick_wins[:10],
        "high_value": high_value[:10],
        "timestamp": ts,
    }


def main(
    base_url: str,
    output_dir: str,
    config: dict[str, str] | None = None,
) -> int:
    """
    Run keyword pipeline and print summary. Returns 0 on success.
    """
    try:
        crawl_csv = (config or {}).get("crawl_csv", "").strip()
        cwd = (config or {}).get("_cwd") or os.getcwd()
        if crawl_csv and not os.path.isabs(crawl_csv):
            crawl_csv = os.path.join(cwd, crawl_csv)
        max_pages = int((config or {}).get("keyword_max_pages") or 0) or 200
        summary = run_keyword_pipeline(
            base_url=base_url,
            output_dir=output_dir,
            config=config,
            crawl_csv_path=crawl_csv if os.path.isfile(crawl_csv) else None,
            max_pages=max_pages,
        )
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1
    print(summary.get("human_summary", ""))
    if summary.get("top_keywords_path"):
        print(f"top_keywords.csv: {summary['top_keywords_path']}")
    if summary.get("clusters_path"):
        print(f"clusters.json: {summary['clusters_path']}")
    return 0
