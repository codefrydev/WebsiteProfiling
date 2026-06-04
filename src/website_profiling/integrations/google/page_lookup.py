"""
Resolve per-page GSC/GA4 metrics from google_data rows or live snapshot payloads.
"""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from .normalize import normalize_url, url_to_path


def _gsc_full_blob(raw: dict[str, Any]) -> dict[str, Any]:
    gsc_full = raw.get("gsc_full")
    if isinstance(gsc_full, dict):
        return gsc_full
    gsc = raw.get("gsc")
    return gsc if isinstance(gsc, dict) else {}


def _ga4_full_blob(raw: dict[str, Any]) -> dict[str, Any]:
    ga4_full = raw.get("ga4_full")
    if isinstance(ga4_full, dict):
        return ga4_full
    ga4 = raw.get("ga4")
    return ga4 if isinstance(ga4, dict) else {}


def _match_gsc_page(by_page: dict[str, Any], page_url: str) -> dict[str, Any] | None:
    if not by_page:
        return None
    if page_url in by_page:
        return by_page[page_url]
    norm = normalize_url(page_url)
    for key, val in by_page.items():
        if normalize_url(str(key)) == norm:
            return val
    # top_pages fallback
    return None


def _match_ga4_path(by_path: dict[str, Any], page_url: str) -> dict[str, Any] | None:
    if not by_path:
        return None
    path = url_to_path(page_url)
    if path in by_path:
        return by_path[path]
    norm = normalize_url(page_url)
    for p, val in by_path.items():
        full = val.get("full_url") if isinstance(val, dict) else ""
        if full and normalize_url(str(full)) == norm:
            return val
        if normalize_url(str(p)) == norm or str(p) == path:
            return val
    return None


def slice_from_google_row(raw: dict[str, Any], page_url: str) -> dict[str, Any]:
    """Extract gsc/ga4 page slice + site benchmarks from a google_data blob."""
    gsc_blob = _gsc_full_blob(raw)
    ga4_blob = _ga4_full_blob(raw)
    by_page = gsc_blob.get("by_page") if isinstance(gsc_blob.get("by_page"), dict) else {}
    by_path = ga4_blob.get("by_path") if isinstance(ga4_blob.get("by_path"), dict) else {}

    gsc_page = _match_gsc_page(by_page, page_url)
    if gsc_page is None and gsc_blob.get("top_pages"):
        norm = normalize_url(page_url)
        for row in gsc_blob.get("top_pages") or []:
            if isinstance(row, dict) and normalize_url(str(row.get("page") or "")) == norm:
                gsc_page = row
                break

    ga4_page = _match_ga4_path(by_path, page_url)
    if ga4_page is None and ga4_blob.get("top_pages"):
        norm = normalize_url(page_url)
        for row in ga4_blob.get("top_pages") or []:
            if not isinstance(row, dict):
                continue
            fu = row.get("full_url") or ""
            if fu and normalize_url(str(fu)) == norm:
                ga4_page = row
                break
            if normalize_url(str(row.get("path") or "")) == norm:
                ga4_page = row
                break

    url_join = raw.get("url_join") if isinstance(raw.get("url_join"), dict) else {}
    norm = normalize_url(page_url)
    in_gsc = gsc_page is not None
    in_ga4 = ga4_page is not None
    in_crawl = False
    for cat in ("crawl_only", "gsc_only", "ga4_only"):
        for item in (url_join.get("lists") or {}).get(cat) or []:
            u = item.get("url") if isinstance(item, dict) else item
            if u and normalize_url(str(u)) == norm:
                if cat == "gsc_only":
                    in_gsc = True
                elif cat == "ga4_only":
                    in_ga4 = True
                break

    date_range = raw.get("date_range") if isinstance(raw.get("date_range"), dict) else {}
    if not date_range.get("start") and gsc_blob.get("date_start"):
        date_range = {"start": gsc_blob.get("date_start"), "end": gsc_blob.get("date_end")}

    return {
        "source": "snapshot",
        "gsc": _public_gsc_page(gsc_page),
        "ga4": _public_ga4_page(ga4_page),
        "coverage": {"inCrawl": in_crawl, "inGsc": in_gsc, "inGa4": in_ga4},
        "siteBenchmarks": {
            "gsc": gsc_blob.get("summary"),
            "ga4": ga4_blob.get("summary"),
        },
        "dateRange": date_range,
        "fetchedAt": raw.get("fetched_at"),
    }


def _public_gsc_page(page: dict[str, Any] | None) -> dict[str, Any] | None:
    if not page:
        return None
    queries = page.get("queries") if isinstance(page.get("queries"), list) else []
    return {
        "page": page.get("page"),
        "clicks": page.get("clicks", 0),
        "impressions": page.get("impressions", 0),
        "ctr": page.get("ctr", 0),
        "position": page.get("position", 0),
        "queries": sorted(
            [q for q in queries if isinstance(q, dict)],
            key=lambda q: int(q.get("impressions") or 0),
            reverse=True,
        )[:25],
    }


def _public_ga4_page(page: dict[str, Any] | None) -> dict[str, Any] | None:
    if not page:
        return None
    return {
        "path": page.get("path"),
        "full_url": page.get("full_url"),
        "sessions": page.get("sessions", 0),
        "activeUsers": page.get("activeUsers", 0),
        "screenPageViews": page.get("screenPageViews", 0),
        "engagementRate": page.get("engagementRate", 0),
        "avgSessionDuration": page.get("avgSessionDuration", 0),
    }


def summary_from_slice(gsc: dict | None, ga4: dict | None) -> dict[str, Any]:
    return {
        "gsc": {
            "clicks": (gsc or {}).get("clicks"),
            "impressions": (gsc or {}).get("impressions"),
            "position": (gsc or {}).get("position"),
        }
        if gsc
        else None,
        "ga4": {
            "sessions": (ga4 or {}).get("sessions"),
            "engagementRate": (ga4 or {}).get("engagementRate"),
        }
        if ga4
        else None,
    }
