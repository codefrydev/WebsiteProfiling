"""Report metadata and URL-level aggregates."""
from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse

import pandas as pd

from ..common import parse_links_serialized
from ..config import get_bool, get_int

def _parse_page_analysis_cell(raw: object) -> dict[str, Any]:
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return {}
    s = str(raw).strip()
    if not s or s == "{}":
        return {}
    try:
        o = json.loads(s)
        return o if isinstance(o, dict) else {}
    except json.JSONDecodeError:
        return {}


def _build_outbound_link_domains(
    df: pd.DataFrame,
    start_url: str,
    max_rows: int,
) -> list[dict[str, Any]]:
    """Aggregate external hosts linked from crawled pages (outbound), not referring domains."""
    site_host = urlparse((start_url or "").strip()).netloc.lower()
    host_pages: dict[str, set[str]] = {}
    host_link_count: dict[str, int] = {}
    for _, row in df.iterrows():
        st = str(row.get("status", "")).strip()
        if st.startswith(("4", "5")):
            continue
        u = str(row.get("url") or "").strip().rstrip("/")
        if not u:
            continue
        seen_on_page: set[str] = set()
        pa = _parse_page_analysis_cell(row.get("page_analysis")) if "page_analysis" in df.columns else {}
        for link in pa.get("external_links") or []:
            if not isinstance(link, str):
                continue
            h = urlparse(link).netloc.lower()
            if not h or h == site_host:
                continue
            host_pages.setdefault(h, set()).add(u)
            host_link_count[h] = host_link_count.get(h, 0) + 1
            seen_on_page.add(link)
        if "outlink_targets" in df.columns:
            for link in parse_links_serialized(row.get("outlink_targets")):
                h = urlparse(link).netloc.lower()
                if not h or h == site_host:
                    continue
                host_pages.setdefault(h, set()).add(u)
                if link not in seen_on_page:
                    host_link_count[h] = host_link_count.get(h, 0) + 1
                    seen_on_page.add(link)
    rows: list[dict[str, Any]] = []
    for h in host_pages:
        rows.append({
            "host": h,
            "page_count": len(host_pages[h]),
            "link_count": host_link_count.get(h, 0),
        })
    rows.sort(key=lambda x: (-x["link_count"], -x["page_count"], x["host"]))
    return rows[:max_rows]


def _build_url_fingerprints(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Stable fingerprints for comparing page content/structure between report runs (no raw HTML stored)."""
    out: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        u = str(row.get("url") or "").strip().rstrip("/")
        if not u:
            continue
        title = str(row.get("title") or "")
        meta = str(row.get("meta_description") or "")
        h1 = str(row.get("h1") or "")
        headings = str(row.get("heading_sequence") or "")
        wc = int(pd.to_numeric(row.get("word_count"), errors="coerce") or 0)
        cl = int(pd.to_numeric(row.get("content_length"), errors="coerce") or 0)
        h1c = int(pd.to_numeric(row.get("h1_count"), errors="coerce") or 0)
        sc = int(pd.to_numeric(row.get("script_count"), errors="coerce") or 0)
        lc = int(pd.to_numeric(row.get("link_stylesheet_count"), errors="coerce") or 0)
        # heading_sequence is structural (h1,h2,...) — keep it in structure fingerprint only.
        raw_c = "|".join([title, meta, h1, str(wc), str(cl)]).encode("utf-8")
        content_fp = hashlib.sha256(raw_c).hexdigest()
        raw_s = "|".join([str(cl), str(sc), str(lc), str(h1c), headings]).encode("utf-8")
        structure_fp = hashlib.sha256(raw_s).hexdigest()
        out.append({
            "url": u,
            "content_fingerprint": content_fp,
            "structure_fingerprint": structure_fp,
        })
    return out


def _build_hreflang_summary(df: pd.DataFrame) -> dict[str, Any]:
    total = 0
    missing_lang = 0
    with_hreflang = 0
    for _, row in df.iterrows():
        st = str(row.get("status", "")).strip()
        if not st.startswith("2"):
            continue
        total += 1
        pa = _parse_page_analysis_cell(row.get("page_analysis")) if "page_analysis" in df.columns else {}
        if not (pa.get("html_lang") or "").strip():
            missing_lang += 1
        if pa.get("hreflang_alternates"):
            with_hreflang += 1
    return {
        "pages_200": total,
        "pages_missing_html_lang": missing_lang,
        "pages_with_hreflang_links": with_hreflang,
    }


def _validate_report_url_counts(report_data: dict[str, Any], df_row_count: int) -> None:
    """Ensure crawled URL counts are consistent across report payload fields."""
    links = report_data.get("links") or []
    summary = report_data.get("summary") or {}
    scope = (report_data.get("report_meta") or {}).get("crawl_scope") or {}
    link_count = len(links) if isinstance(links, list) else 0
    total_urls = int(summary.get("total_urls") or 0)
    pages_crawled = int(scope.get("pages_crawled") or 0)
    counts = {link_count, total_urls, pages_crawled, df_row_count}
    if len(counts) > 1:
        msg = (
            f"report count mismatch: links={link_count}, "
            f"summary.total_urls={total_urls}, "
            f"pages_crawled={pages_crawled}, df_rows={df_row_count}"
        )
        print(f"  WARNING: {msg}", flush=True)
        report_data.setdefault("ml_errors", []).append(msg)


def _build_report_metadata(
    df: pd.DataFrame,
    config: Optional[dict[str, str]],
    lighthouse_summary: Optional[dict[str, Any]],
    google_data: Optional[dict[str, Any]],
    keywords_data: Optional[dict[str, Any]],
    ml_bundle: dict[str, Any],
    run_id: Optional[int],
    crawl_run_created_at: Optional[str],
    gsc_links_data: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Provenance and crawl scope for agency-facing audits."""
    sources: list[str] = ["crawl"]
    if lighthouse_summary:
        sources.append("lighthouse")
    if google_data:
        if google_data.get("gsc") or google_data.get("gsc_summary"):
            sources.append("search_console")
        if google_data.get("ga4") or google_data.get("ga4_summary"):
            sources.append("analytics")
    if gsc_links_data and "search_console" not in sources:
        sources.append("search_console")
    llm_meta = ml_bundle.get("llm_meta")
    if isinstance(llm_meta, dict) and llm_meta.get("model"):
        sources.append("ai")
    kw_rows = (keywords_data or {}).get("rows") or []
    has_gsc_kw = any(
        (r.get("gsc_impressions") or r.get("gsc_clicks")) and r.get("source") in ("gsc", "site+gsc", None)
        for r in kw_rows[:500]
        if isinstance(r, dict)
    )
    if kw_rows and not has_gsc_kw and "estimated" not in sources:
        sources.append("estimated")

    max_pages_cfg = get_int(config or {}, "max_pages", 0) or 0
    pages_crawled = len(df)
    blocked = 0
    if not df.empty and "status" in df.columns:
        blocked = int((df["status"].astype(str) == "blocked_by_robots").sum())

    render_mode = (str((config or {}).get("crawl_render_mode") or "static")).strip().lower()
    js_concurrency = get_int(config or {}, "crawl_js_concurrency", 3) or 3
    static_html_only = render_mode == "static"

    crawl_scope: dict[str, Any] = {
        "pages_crawled": pages_crawled,
        "max_pages_configured": max_pages_cfg or pages_crawled,
        "robots_blocked_count": blocked,
        "static_html_only": static_html_only,
        "render_mode": render_mode,
        "js_concurrency": js_concurrency if not static_html_only else None,
        "crawl_limited": bool(max_pages_cfg and pages_crawled >= max_pages_cfg),
    }
    if not df.empty and "fetch_method" in df.columns:
        fm = df["fetch_method"].astype(str).str.strip().str.lower()
        pages_static = int((fm == "static").sum())
        pages_rendered = int((fm == "rendered").sum())
        if render_mode == "auto" or pages_rendered > 0:
            crawl_scope["pages_static"] = pages_static
            crawl_scope["pages_rendered"] = pages_rendered

    from ..crawl.fetchers.browser_diagnostics import aggregate_browser_diagnostics_df

    browser_agg = aggregate_browser_diagnostics_df(df)
    if browser_agg and (render_mode != "static" or browser_agg.get("total_console_errors", 0) > 0):
        crawl_scope["browser_diagnostics"] = browser_agg

    meta: dict[str, Any] = {
        "data_sources": sources,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "crawl_scope": crawl_scope,
    }
    if run_id is not None:
        meta["crawl_run_id"] = run_id
    if crawl_run_created_at:
        meta["crawl_run_created_at"] = crawl_run_created_at
    if google_data:
        meta["google_fetched_at"] = google_data.get("fetched_at")
        meta["google_date_range_days"] = google_data.get("date_range_days")
        gsc = google_data.get("gsc") or {}
        if isinstance(gsc, dict) and gsc.get("row_count") is not None:
            meta["gsc_row_count"] = gsc.get("row_count")
    if keywords_data:
        meta["keywords_enriched_at"] = keywords_data.get("enriched_at") or keywords_data.get("fetched_at")
    if gsc_links_data:
        meta["gsc_links_imported_at"] = gsc_links_data.get("imported_at")
        meta["gsc_links_referring_domains"] = len(gsc_links_data.get("top_linking_sites") or [])
        sample_n = len(gsc_links_data.get("sample_links") or [])
        latest_n = len(gsc_links_data.get("latest_links") or [])
        meta["gsc_links_sample_count"] = sample_n + latest_n
    if isinstance(llm_meta, dict):
        meta["llm"] = llm_meta
    logo_url = (str((config or {}).get("export_logo_url") or "")).strip()
    if logo_url:
        meta["export_logo_url"] = logo_url
    return meta
