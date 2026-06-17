"""Content and crawl analytics for report payloads."""
from __future__ import annotations

import json
from typing import Any, Optional

import pandas as pd

from ..analysis.text_hygiene import filter_topic_clusters, is_junk_semantic_term
from ..config import get_bool, get_int
from ..tools.keywords import cluster_keywords, extract_candidates_from_df, score_keywords

def _build_content_analytics(df: pd.DataFrame) -> dict:
    """Build content analytics: word count stats, reading level distribution, content ratio, top keywords."""
    from collections import Counter

    result = {
        "word_count_stats": {"mean": 0, "median": 0, "p25": 0, "p75": 0, "min": 0, "max": 0},
        "word_count_distribution": {},
        "reading_level_distribution": {},
        "content_ratio_distribution": {},
        "top_keywords_site": [],
        "thin_pages": [],
    }
    if "word_count" not in df.columns or df.empty:
        return result

    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    if success_df.empty:
        return result

    wc = pd.to_numeric(success_df["word_count"], errors="coerce").fillna(0).astype(int)
    result["word_count_stats"] = {
        "mean": round(float(wc.mean()), 1),
        "median": round(float(wc.median()), 1),
        "p25": round(float(wc.quantile(0.25)), 1),
        "p75": round(float(wc.quantile(0.75)), 1),
        "min": int(wc.min()),
        "max": int(wc.max()),
    }

    wc_bins = [(0, 100), (101, 300), (301, 600), (601, 1000), (1001, 2000), (2001, 999999)]
    wc_labels = ["0-100", "101-300", "301-600", "601-1000", "1001-2000", "2001+"]
    result["word_count_distribution"] = {
        lbl: int(((wc >= lo) & (wc <= hi)).sum()) for (lo, hi), lbl in zip(wc_bins, wc_labels)
    }

    if "reading_level" in success_df.columns:
        rl = pd.to_numeric(success_df["reading_level"], errors="coerce").fillna(0)
        # Half-open contiguous bins: reading_level is a float (Flesch-Kincaid grade),
        # so inclusive bins like (0,5)/(6,8) silently dropped fractional grades (5.5, 8.7).
        rl_bins = [(0, 6), (6, 9), (9, 13), (13, float("inf"))]
        rl_labels = ["Elementary (0-5)", "Middle School (6-8)", "High School (9-12)", "College (13+)"]
        result["reading_level_distribution"] = {
            lbl: int(((rl >= lo) & (rl < hi)).sum()) for (lo, hi), lbl in zip(rl_bins, rl_labels)
        }

    if "content_html_ratio" in success_df.columns:
        cr = pd.to_numeric(success_df["content_html_ratio"], errors="coerce").fillna(0)
        cr_bins = [(0, 10), (10.01, 20), (20.01, 40), (40.01, 100)]
        cr_labels = ["<10%", "10-20%", "20-40%", ">40%"]
        result["content_ratio_distribution"] = {
            lbl: int(((cr >= lo) & (cr <= hi)).sum()) for (lo, hi), lbl in zip(cr_bins, cr_labels)
        }

    if "top_keywords" in success_df.columns:
        kw_counter = Counter()
        for raw in success_df["top_keywords"].fillna("[]"):
            try:
                items = json.loads(str(raw)) if isinstance(raw, str) else raw
                if isinstance(items, list):
                    for item in items:
                        if isinstance(item, dict):
                            kw_counter[item.get("word", "")] += item.get("count", 0)
            except (json.JSONDecodeError, TypeError):
                pass
        result["top_keywords_site"] = [
            {"word": w, "count": c}
            for w, c in kw_counter.most_common(50)
            if w and not is_junk_semantic_term(str(w))
        ][:30]

    for _, row in success_df.iterrows():
        u = row.get("url")
        if pd.isna(u) or not u:
            continue
        w = int(pd.to_numeric(row.get("word_count"), errors="coerce") or 0)
        if 0 < w < 300:
            result["thin_pages"].append({"url": str(u).strip(), "word_count": w})

    return result


def _parse_top_keywords_items(raw: Any) -> list[dict[str, Any]]:
    """Parse per-page top_keywords JSON into dict items with word/count."""
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return []
    try:
        items = json.loads(str(raw)) if isinstance(raw, str) else raw
    except (json.JSONDecodeError, TypeError, ValueError):
        return []
    if not isinstance(items, list):
        return []
    out: list[dict[str, Any]] = []
    for item in items:
        if isinstance(item, dict):
            word = str(item.get("word") or "").strip()
            if word:
                out.append({"word": word, "count": int(item.get("count") or 1)})
    return out


def _build_text_content_analysis(df: pd.DataFrame) -> dict:
    """Cross-page keyword aggregates for the text content analysis view."""
    empty = {
        "vocabulary_stats": {
            "unique_terms": 0,
            "pages_with_keywords": 0,
            "avg_terms_per_page": 0.0,
            "total_term_occurrences": 0,
        },
        "keyword_index": [],
        "keyword_frequency_histogram": {"1": 0, "2-5": 0, "6-20": 0, "21+": 0},
    }
    if df.empty or "top_keywords" not in df.columns:
        return empty

    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    if success_df.empty:
        return empty

    # word -> { total_count, pages: { url -> count } }
    index: dict[str, dict[str, Any]] = {}
    pages_with_keywords = 0
    total_occurrences = 0

    for _, row in success_df.iterrows():
        url = row.get("url")
        if pd.isna(url) or not url:
            continue
        url_str = str(url).strip()
        items = _parse_top_keywords_items(row.get("top_keywords"))
        page_had_kw = False
        for item in items:
            word = item["word"].lower()
            if is_junk_semantic_term(word):
                continue
            count = max(1, int(item.get("count") or 1))
            if word not in index:
                index[word] = {"total_count": 0, "pages": {}}
            index[word]["total_count"] += count
            index[word]["pages"][url_str] = index[word]["pages"].get(url_str, 0) + count
            total_occurrences += count
            page_had_kw = True
        if page_had_kw:
            pages_with_keywords += 1

    unique_terms = len(index)
    avg_terms = round(total_occurrences / pages_with_keywords, 1) if pages_with_keywords else 0.0

    histogram = {"1": 0, "2-5": 0, "6-20": 0, "21+": 0}
    for data in index.values():
        pc = len(data["pages"])
        if pc == 1:
            histogram["1"] += 1
        elif pc <= 5:
            histogram["2-5"] += 1
        elif pc <= 20:
            histogram["6-20"] += 1
        else:
            histogram["21+"] += 1

    sorted_words = sorted(index.items(), key=lambda x: x[1]["total_count"], reverse=True)
    keyword_index: list[dict[str, Any]] = []
    for word, data in sorted_words:
        top_pages = sorted(data["pages"].items(), key=lambda x: x[1], reverse=True)[:5]
        keyword_index.append(
            {
                "word": word,
                "total_count": data["total_count"],
                "page_count": len(data["pages"]),
                "top_pages": [{"url": u, "count": c} for u, c in top_pages],
            }
        )

    return {
        "vocabulary_stats": {
            "unique_terms": unique_terms,
            "pages_with_keywords": pages_with_keywords,
            "avg_terms_per_page": avg_terms,
            "total_term_occurrences": total_occurrences,
        },
        "keyword_index": keyword_index,
        "keyword_frequency_histogram": histogram,
    }


def _build_social_coverage(df: pd.DataFrame) -> dict:
    """Build social meta coverage stats: OG and Twitter Card presence percentages."""
    result = {
        "og_coverage_pct": 0,
        "twitter_coverage_pct": 0,
        "og_image_coverage_pct": 0,
        "missing_og": [],
        "missing_twitter": [],
        "og_image_missing": [],
    }
    if df.empty:
        return result

    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    html_df = success_df
    if "content_type" in success_df.columns:
        html_df = success_df[success_df["content_type"].fillna("").str.contains("text/html", case=False, na=False)]
    if html_df.empty:
        return result

    total = len(html_df)

    if "og_title" in html_df.columns:
        has_og = (html_df["og_title"].fillna("").astype(str).str.strip() != "").sum()
        result["og_coverage_pct"] = round(100 * int(has_og) / total, 1)
        for _, row in html_df.iterrows():
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            og = str(row.get("og_title") or "").strip()
            if not og:
                result["missing_og"].append(u)

    if "twitter_card" in html_df.columns:
        has_tw = (html_df["twitter_card"].fillna("").astype(str).str.strip() != "").sum()
        result["twitter_coverage_pct"] = round(100 * int(has_tw) / total, 1)
        for _, row in html_df.iterrows():
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            tw = str(row.get("twitter_card") or "").strip()
            if not tw:
                result["missing_twitter"].append(u)

    if "og_image" in html_df.columns:
        has_og_img = (html_df["og_image"].fillna("").astype(str).str.strip() != "").sum()
        result["og_image_coverage_pct"] = round(100 * int(has_og_img) / total, 1)
        for _, row in html_df.iterrows():
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            img = str(row.get("og_image") or "").strip()
            if not img:
                result["og_image_missing"].append(u)

    result["missing_og"] = result["missing_og"][:100]
    result["missing_twitter"] = result["missing_twitter"][:100]
    result["og_image_missing"] = result["og_image_missing"][:100]
    return result


def _build_tech_stack_summary(df: pd.DataFrame) -> dict:
    """Build tech stack summary: detected technologies with counts and sample URLs."""
    from collections import defaultdict

    result = {"technologies": [], "total_pages_analyzed": 0}
    if "tech_stack" not in df.columns or df.empty:
        return result

    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns else df
    html_df = success_df
    if "content_type" in success_df.columns:
        html_df = success_df[success_df["content_type"].fillna("").str.contains("text/html", case=False, na=False)]
    if html_df.empty:
        return result

    result["total_pages_analyzed"] = len(html_df)
    tech_urls = defaultdict(list)

    for _, row in html_df.iterrows():
        u = str(row.get("url", "")).strip()
        raw = row.get("tech_stack") or "[]"
        try:
            techs = json.loads(str(raw)) if isinstance(raw, str) else raw
            if isinstance(techs, list):
                for t in techs:
                    if isinstance(t, str) and t:
                        tech_urls[t].append(u)
        except (json.JSONDecodeError, TypeError):
            pass

    result["technologies"] = sorted(
        [{"name": name, "count": len(urls), "sample_urls": urls[:3]} for name, urls in tech_urls.items()],
        key=lambda x: x["count"],
        reverse=True,
    )
    return result


def _build_response_time_stats(df: pd.DataFrame) -> dict:
    """Build response time statistics and distribution."""
    result = {
        "p25": 0, "p50": 0, "p75": 0, "p95": 0, "p99": 0,
        "slow_pages": [],
        "distribution": {},
    }
    if "response_time_ms" not in df.columns or df.empty:
        return result

    rt = pd.to_numeric(df["response_time_ms"], errors="coerce").dropna()
    if rt.empty:
        return result

    result["p25"] = round(float(rt.quantile(0.25)), 0)
    result["p50"] = round(float(rt.quantile(0.50)), 0)
    result["p75"] = round(float(rt.quantile(0.75)), 0)
    result["p95"] = round(float(rt.quantile(0.95)), 0)
    result["p99"] = round(float(rt.quantile(0.99)), 0)

    rt_bins = [(0, 200), (200, 500), (500, 1000), (1000, 2000), (2000, 999999)]
    rt_labels = ["<200ms", "200-500ms", "500ms-1s", "1-2s", ">2s"]
    rt_full = pd.to_numeric(df["response_time_ms"], errors="coerce").fillna(0)
    result["distribution"] = {
        lbl: int(((rt_full >= lo) & (rt_full < hi)).sum()) for (lo, hi), lbl in zip(rt_bins, rt_labels)
    }

    for _, row in df.iterrows():
        u = row.get("url")
        ms = pd.to_numeric(row.get("response_time_ms"), errors="coerce")
        if pd.isna(u) or pd.isna(ms) or ms <= 2000:
            continue
        result["slow_pages"].append({"url": str(u).strip(), "response_time_ms": int(ms)})
    result["slow_pages"] = sorted(result["slow_pages"], key=lambda x: x["response_time_ms"], reverse=True)[:50]
    return result


def _build_depth_distribution(df: pd.DataFrame) -> dict:
    """Build crawl depth distribution."""
    result = {"by_depth": {}, "max_depth": 0, "avg_depth": 0}
    if "depth" not in df.columns or df.empty:
        return result

    depths = pd.to_numeric(df["depth"], errors="coerce").dropna().astype(int)
    if depths.empty:
        return result

    result["max_depth"] = int(depths.max())
    result["avg_depth"] = round(float(depths.mean()), 1)
    counts = depths.value_counts().sort_index()
    result["by_depth"] = {str(int(k)): int(v) for k, v in counts.items()}
    return result


def _build_keyword_opportunities(df: pd.DataFrame, config: dict[str, str] | None) -> dict[str, Any]:
    if not get_bool(config or {}, "include_keyword_opportunities", True):
        return {}
    if "status" not in df.columns or df.empty:
        return {"quick_wins": [], "high_value": [], "token_topic_clusters": []}
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)]
    if success_df.empty:
        return {"quick_wins": [], "high_value": [], "token_topic_clusters": []}
    candidates = extract_candidates_from_df(success_df)
    if not candidates:
        return {"quick_wins": [], "high_value": [], "token_topic_clusters": []}
    corpus_size = len(success_df)
    scored = score_keywords(candidates, corpus_size=corpus_size)
    clusters = cluster_keywords(scored)
    quick_wins = [s for s in scored if s.get("difficulty", 100) < 60][:10]
    high_value = [s for s in scored if (s.get("volume") or 0) >= 0.5][:10]
    if not high_value:
        high_value = scored[:10]
    return {
        "quick_wins": quick_wins[:10],
        "high_value": high_value[:10],
        "token_topic_clusters": filter_topic_clusters(clusters)[:50],
    }


def _build_image_inventory(
    links: list[dict[str, Any]],
    config: Optional[dict[str, str]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    from ..analysis.image_probe import collect_image_refs_from_links, probe_image_urls

    refs = collect_image_refs_from_links(links)
    unoptimized_min_kb = get_int(config or {}, "image_unoptimized_min_kb", 200) or 200
    summary: dict[str, Any] = {
        "probed": 0,
        "failed": 0,
        "total_bytes": 0,
        "over_threshold_count": 0,
        "unoptimized_min_kb": unoptimized_min_kb,
        "inventory_available": False,
    }
    if not get_bool(config or {}, "probe_image_inventory", False):
        return [], summary

    max_urls = get_int(config or {}, "max_image_probe_urls", 500) or 500
    concurrency = get_int(config or {}, "image_probe_concurrency", 6) or 6
    probe_timeout = get_int(config or {}, "image_probe_timeout", 8) or 8
    url_list = list(refs.keys())[:max_urls]
    if not url_list:
        return [], summary

    print(f"  Probing up to {len(url_list)} image URL(s)...", flush=True)
    probed = probe_image_urls(
        url_list,
        concurrency=concurrency,
        timeout=probe_timeout,
    )
    threshold_bytes = unoptimized_min_kb * 1024
    inventory: list[dict[str, Any]] = []
    for row in probed:
        url = row.get("url")
        meta = refs.get(str(url or ""), {"source_pages": set(), "kinds": set()})
        size = row.get("size_bytes")
        entry = {
            "url": url,
            "status": row.get("status"),
            "content_type": row.get("content_type"),
            "size_bytes": size,
            "error": row.get("error"),
            "source_pages": sorted(meta.get("source_pages") or []),
            "kinds": sorted(meta.get("kinds") or []),
        }
        inventory.append(entry)
        summary["probed"] += 1
        if row.get("error") or row.get("status") is None:
            summary["failed"] += 1
        if size is not None:
            summary["total_bytes"] += int(size)
            if int(size) >= threshold_bytes:
                summary["over_threshold_count"] += 1
    summary["inventory_available"] = True
    print(f"  Image probe complete ({summary['probed']} URLs, {summary['failed']} failed).", flush=True)
    return inventory, summary
