"""Indexation coverage: sitemap vs crawl vs Search Console URL sets."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

import pandas as pd

from ..crawl.sitemap import discover_sitemap_urls
from ..integrations.google.normalize import compute_url_join, normalize_url


def _success_urls(df: pd.DataFrame) -> list[str]:
    if df.empty or "url" not in df.columns:
        return []
    if "status" not in df.columns:
        return [str(u).strip() for u in df["url"].dropna().astype(str).tolist() if str(u).strip()]
    ok = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)]
    return (
        ok["url"]
        .dropna()
        .astype(str)
        .str.strip()
        .loc[lambda s: s != ""]
        .unique()
        .tolist()
    )


def _gsc_page_urls(google_data: dict[str, Any] | None) -> list[str]:
    if not google_data:
        return []
    gsc = google_data.get("gsc") if isinstance(google_data.get("gsc"), dict) else {}
    pages = gsc.get("pages") if isinstance(gsc.get("pages"), list) else []
    out: list[str] = []
    for row in pages:
        if isinstance(row, dict):
            u = str(row.get("page") or row.get("url") or "").strip()
            if u:
                out.append(u)
    return out


def _gsc_by_page(google_data: dict[str, Any] | None) -> dict[str, dict]:
    if not google_data:
        return {}
    gsc = google_data.get("gsc") if isinstance(google_data.get("gsc"), dict) else {}
    pages = gsc.get("pages") if isinstance(gsc.get("pages"), list) else []
    out: dict[str, dict] = {}
    for row in pages:
        if isinstance(row, dict):
            u = str(row.get("page") or row.get("url") or "").strip()
            if u:
                out[u] = row
    return out


def build_indexation_coverage(
    df: pd.DataFrame,
    start_url: str,
    google_data: dict[str, Any] | None = None,
    *,
    list_limit: int = 200,
) -> dict[str, Any]:
    """Compare crawled URLs, sitemap URLs, and GSC pages."""
    crawl_urls = _success_urls(df)
    sitemap_urls = discover_sitemap_urls(start_url) if start_url else []
    gsc_pages = _gsc_page_urls(google_data)

    crawl_norm = {normalize_url(u): u for u in crawl_urls}
    sitemap_norm = {normalize_url(u): u for u in sitemap_urls}
    gsc_norm = {normalize_url(u): u for u in gsc_pages}

    sitemap_only_norm = set(sitemap_norm) - set(crawl_norm)
    crawled_not_in_sitemap_norm = set(crawl_norm) - set(sitemap_norm)
    gsc_not_crawled_norm = set(gsc_norm) - set(crawl_norm)

    url_join = compute_url_join(
        crawl_urls,
        gsc_pages,
        [],
        start_url,
        gsc_by_page=_gsc_by_page(google_data),
        list_limit=list_limit,
    )

    def _cap(items: list[str]) -> tuple[list[str], int]:
        total = len(items)
        return items[:list_limit], total

    sitemap_only_list, sitemap_only_total = _cap([sitemap_norm[k] for k in sorted(sitemap_only_norm)])
    crawled_not_sitemap_list, crawled_not_sitemap_total = _cap(
        [crawl_norm[k] for k in sorted(crawled_not_in_sitemap_norm)]
    )
    gsc_not_crawled_list, gsc_not_crawled_total = _cap([gsc_norm[k] for k in sorted(gsc_not_crawled_norm)])

    origin = ""
    if start_url:
        p = urlparse(start_url)
        if p.scheme and p.netloc:
            origin = f"{p.scheme}://{p.netloc}"

    return {
        "origin": origin,
        "counts": {
            "crawled": len(crawl_norm),
            "sitemap": len(sitemap_norm),
            "gsc_pages": len(gsc_norm),
            "sitemap_only": sitemap_only_total,
            "crawled_not_in_sitemap": crawled_not_sitemap_total,
            "gsc_not_crawled": gsc_not_crawled_total,
        },
        "lists": {
            "sitemap_only": sitemap_only_list,
            "crawled_not_in_sitemap": crawled_not_sitemap_list,
            "gsc_not_crawled": gsc_not_crawled_list,
        },
        "lists_total": {
            "sitemap_only": sitemap_only_total,
            "crawled_not_in_sitemap": crawled_not_sitemap_total,
            "gsc_not_crawled": gsc_not_crawled_total,
        },
        "url_join": url_join,
        "sitemap_urls": [sitemap_norm[k] for k in sorted(sitemap_norm)][:list_limit],
        "sitemap_urls_total": len(sitemap_norm),
    }
