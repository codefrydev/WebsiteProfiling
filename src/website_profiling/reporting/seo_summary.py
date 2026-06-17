"""SEO summary and issue computation for reports."""
from __future__ import annotations

import pandas as pd

# SEO thresholds for recommendations
TITLE_LEN_MIN = 30
TITLE_LEN_MAX = 60
META_DESC_LEN_MIN = 70
META_DESC_LEN_MAX = 160
THIN_CONTENT_CHARS = 300


def _status_text(value: object) -> str:
    """Normalize a status value to a clean string (e.g. 400.0 -> "400").

    Numeric statuses can arrive as ints, strings, or floats (when pandas coerces
    a column containing NaN); non-numeric markers like "error"/"blocked_by_robots"
    pass through unchanged. Keeps status-code matching robust across all of them.
    """
    if value is None:
        return ""
    try:
        f = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return str(value).strip()
    if f != f:  # NaN
        return ""
    return str(int(f))


def _compute_summary_seo_issues(df: pd.DataFrame) -> dict:
    """Compute crawl summary, SEO health metrics, issues list, and recommendations from crawl DataFrame."""
    total = len(df)
    status_str = df["status"].map(_status_text) if "status" in df.columns else pd.Series(["unknown"] * len(df))
    count_2xx = int((status_str.str.match(r"2\d{2}").fillna(False)).sum())
    count_3xx = int((status_str.str.match(r"3\d{2}").fillna(False)).sum())
    count_4xx = int((status_str.str.match(r"4\d{2}").fillna(False)).sum())
    count_5xx = int((status_str.str.match(r"5\d{2}").fillna(False)).sum())
    count_error = int((status_str.isin(["error", "blocked_by_robots"])).sum())
    success_rate = round(100 * count_2xx / total, 1) if total else 0

    outlinks = (
        pd.to_numeric(df["outlinks"], errors="coerce").fillna(0).astype(int)
        if "outlinks" in df.columns
        else pd.Series([0] * len(df))
    )
    title_len = (
        df["title"].fillna("").astype(str).apply(len)
        if "title" in df.columns
        else pd.Series([0] * len(df))
    )
    crawl_time_s = float(df["crawl_time_s"].iloc[0]) if "crawl_time_s" in df.columns and len(df) else None

    summary = {
        "total_urls": total,
        "count_2xx": count_2xx,
        "count_3xx": count_3xx,
        "count_4xx": count_4xx,
        "count_5xx": count_5xx,
        "count_error": count_error,
        "success_rate": success_rate,
        "avg_outlinks": round(float(outlinks.mean()), 1) if total else 0,
        "avg_title_len": round(float(title_len.mean()), 1) if total else 0,
        "crawl_time_s": round(crawl_time_s, 1) if crawl_time_s is not None else None,
    }

    # SEO health (when columns exist)
    seo_health = {}
    if "title" in df.columns:
        titles = df["title"].fillna("").astype(str)
        seo_health["missing_title"] = int((titles.str.len() == 0).sum())
        seo_health["title_short"] = int(((title_len > 0) & (title_len < TITLE_LEN_MIN)).sum())
        seo_health["title_long"] = int((title_len > TITLE_LEN_MAX).sum())
        seo_health["title_ok"] = int(((title_len >= TITLE_LEN_MIN) & (title_len <= TITLE_LEN_MAX)).sum())
    if "meta_description_len" in df.columns:
        md_len = pd.to_numeric(df["meta_description_len"], errors="coerce").fillna(0).astype(int)
        seo_health["missing_meta_desc"] = int((md_len == 0).sum())
        seo_health["meta_desc_short"] = int(((md_len > 0) & (md_len < META_DESC_LEN_MIN)).sum())
        seo_health["meta_desc_long"] = int((md_len > META_DESC_LEN_MAX).sum())
        seo_health["meta_desc_ok"] = int(((md_len >= META_DESC_LEN_MIN) & (md_len <= META_DESC_LEN_MAX)).sum())
    if "h1_count" in df.columns:
        h1c = pd.to_numeric(df["h1_count"], errors="coerce").fillna(-1).astype(int)
        seo_health["h1_zero"] = int((h1c == 0).sum())
        seo_health["h1_one"] = int((h1c == 1).sum())
        seo_health["h1_multi"] = int((h1c > 1).sum())
    if "content_length" in df.columns:
        cl = pd.to_numeric(df["content_length"], errors="coerce").fillna(0).astype(int)
        seo_health["thin_content"] = int(((cl > 0) & (cl < THIN_CONTENT_CHARS)).sum())

    # Issues: broken, redirects, SEO
    issues = {"broken": [], "redirects": [], "seo": []}
    for _, row in df.iterrows():
        u = row.get("url")
        if pd.isna(u) or not u:
            continue
        u = str(u).strip()
        st = _status_text(row.get("status", ""))
        if st.startswith("4") or st.startswith("5") or st in ("error", "blocked_by_robots"):
            issues["broken"].append({"url": u, "status": st})
        elif st.startswith("3"):
            final = row.get("final_url") or ""
            issues["redirects"].append({"url": u, "status": st, "final_url": str(final) if pd.notna(final) else ""})

    if "title" in df.columns:
        for _, row in df.iterrows():
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            t = row.get("title") or ""
            tl = len(str(t).strip())
            if tl == 0:
                issues["seo"].append({"type": "missing_title", "url": u, "message": "Missing title"})
            elif tl < TITLE_LEN_MIN:
                issues["seo"].append({"type": "title_short", "url": u, "message": f"Title too short ({tl} chars)"})
            elif tl > TITLE_LEN_MAX:
                issues["seo"].append({"type": "title_long", "url": u, "message": f"Title too long ({tl} chars)"})
    if "meta_description_len" in df.columns:
        for _, row in df.iterrows():
            md_len = pd.to_numeric(row.get("meta_description_len"), errors="coerce")
            if pd.isna(md_len) or md_len == 0:
                continue
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            ml = int(md_len)
            if ml < META_DESC_LEN_MIN:
                issues["seo"].append({"type": "meta_desc_short", "url": u, "message": f"Meta description too short ({ml} chars)"})
            elif ml > META_DESC_LEN_MAX:
                issues["seo"].append({"type": "meta_desc_long", "url": u, "message": f"Meta description too long ({ml} chars)"})
    if "h1_count" in df.columns:
        for _, row in df.iterrows():
            h1c = pd.to_numeric(row.get("h1_count"), errors="coerce")
            if pd.isna(h1c) or h1c == 1:
                continue
            u = row.get("url")
            if pd.isna(u):
                continue
            u = str(u).strip()
            if int(h1c) == 0:
                issues["seo"].append({"type": "h1_missing", "url": u, "message": "Missing H1"})
            else:
                issues["seo"].append({"type": "h1_multi", "url": u, "message": f"Multiple H1s ({int(h1c)})"})
    if "content_length" in df.columns:
        for _, row in df.iterrows():
            cl = pd.to_numeric(row.get("content_length"), errors="coerce")
            cl = 0 if pd.isna(cl) else int(cl)
            if cl >= THIN_CONTENT_CHARS or cl == 0:
                continue
            u = row.get("url")
            if pd.isna(u):
                continue
            issues["seo"].append({"type": "thin_content", "url": str(u).strip(), "message": f"Thin content ({int(cl)} chars)"})

    # Recommendations (actionable bullets)
    recommendations = []
    if issues["broken"]:
        recommendations.append(f"Fix {len(issues['broken'])} broken or error URL(s).")
    if issues["redirects"]:
        recommendations.append(f"Review {len(issues['redirects'])} redirect(s); consolidate if possible.")
    if seo_health.get("missing_title", 0) > 0:
        recommendations.append(f"Add titles to {seo_health['missing_title']} page(s).")
    if seo_health.get("title_short", 0) + seo_health.get("title_long", 0) > 0:
        n = seo_health.get("title_short", 0) + seo_health.get("title_long", 0)
        recommendations.append(f"Optimize title length on {n} page(s) (aim 30–60 chars).")
    if seo_health.get("missing_meta_desc", 0) > 0:
        recommendations.append(f"Add meta descriptions to {seo_health['missing_meta_desc']} page(s).")
    if seo_health.get("meta_desc_short", 0) + seo_health.get("meta_desc_long", 0) > 0:
        n = seo_health.get("meta_desc_short", 0) + seo_health.get("meta_desc_long", 0)
        recommendations.append(f"Optimize meta description length on {n} page(s) (aim 70–160 chars).")
    if seo_health.get("h1_zero", 0) > 0:
        recommendations.append(f"Add one H1 per page on {seo_health['h1_zero']} page(s).")
    if seo_health.get("h1_multi", 0) > 0:
        recommendations.append(f"Use a single H1 per page on {seo_health['h1_multi']} page(s).")
    if seo_health.get("thin_content", 0) > 0:
        recommendations.append(f"Expand thin content on {seo_health['thin_content']} page(s) (under {THIN_CONTENT_CHARS} chars).")

    return {
        "summary": summary,
        "seo_health": seo_health,
        "issues": issues,
        "recommendations": recommendations,
    }
