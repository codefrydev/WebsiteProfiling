"""Crawl page query tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...integrations.google.page_lookup import slice_from_google_row
from .context import AuditToolContext

_PAGE_LIMIT_MAX = 30


def _page_row(rec: dict[str, Any]) -> dict[str, Any]:
    return {
        "url": str(rec.get("url") or ""),
        "status": str(rec.get("status") or ""),
        "title": str(rec.get("title") or ""),
        "inlinks": rec.get("inlinks"),
    }


def search_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}

    status_filter = str(args.get("status") or "").strip()
    url_contains = str(args.get("url_contains") or "").strip().lower()
    limit = args.get("limit", _PAGE_LIMIT_MAX)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = _PAGE_LIMIT_MAX
    limit = max(1, min(limit, _PAGE_LIMIT_MAX))

    records = df.to_dict(orient="records")
    if status_filter:
        records = [r for r in records if str(r.get("status") or "") == status_filter]
    if url_contains:
        records = [r for r in records if url_contains in str(r.get("url") or "").lower()]

    total = len(records)
    truncated = total > limit
    pages = [_page_row(r) for r in records[:limit]]
    return {"pages": pages, "total": total, "truncated": truncated}


def get_page_details(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip().rstrip("/")
    if not url:
        return {"error": "url is required"}

    df = scoped.load_crawl_df(conn)
    crawl_row: dict[str, Any] | None = None
    if df is not None and not df.empty and "url" in df.columns:
        norm = url.rstrip("/")
        for _, row in df.iterrows():
            row_url = str(row.get("url") or "").rstrip("/")
            if row_url == norm or row_url == url:
                crawl_row = {
                    "url": row_url,
                    "status": str(row.get("status") or ""),
                    "title": str(row.get("title") or ""),
                    "meta_description": str(row.get("meta_description") or ""),
                    "h1": row.get("h1"),
                    "word_count": row.get("word_count"),
                    "inlinks": row.get("inlinks"),
                    "outlinks": row.get("outlinks"),
                    "content_type": str(row.get("content_type") or ""),
                }
                break

    payload = scoped.load_payload(conn)
    lighthouse_by_url = payload.get("lighthouse_by_url") or {}
    lh = lighthouse_by_url.get(url) or lighthouse_by_url.get(url + "/")
    if not lh and crawl_row:
        lh = lighthouse_by_url.get(crawl_row.get("url", ""))

    google_raw = scoped.load_google(conn)
    gsc_ga4 = None
    if google_raw:
        gsc_ga4 = slice_from_google_row(google_raw, url)

    return {
        "url": url,
        "crawl": crawl_row,
        "lighthouse": lh if isinstance(lh, dict) else None,
        "gsc_ga4": gsc_ga4,
        "found_in_crawl": crawl_row is not None,
    }


def get_internal_links(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip().rstrip("/")
    if not url:
        return {"error": "url is required"}

    from ...db.crawl_store import read_edges

    payload = scoped.load_payload(conn)
    run_id = payload.get("crawl_run_id")
    try:
        rid = int(run_id) if run_id is not None else None
    except (TypeError, ValueError):
        rid = None

    edges = read_edges(conn, rid)
    outlinks = [b for a, b in edges if a.rstrip("/") == url]
    inlinks = [a for a, b in edges if b.rstrip("/") == url]
    limit = 50
    return {
        "url": url,
        "outlinks": outlinks[:limit],
        "inlinks": inlinks[:limit],
        "outlink_count": len(outlinks),
        "inlink_count": len(inlinks),
        "truncated": len(outlinks) > limit or len(inlinks) > limit,
    }
