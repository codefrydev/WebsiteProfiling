"""Google Search Console / GA4 summary tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...integrations.google.page_lookup import slice_from_google_row
from ._slice import cap_list, parse_limit
from .context import AuditToolContext


def get_google_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "property_id": scoped.property_id}

    gsc = data.get("gsc") if isinstance(data.get("gsc"), dict) else {}
    ga4 = data.get("ga4") if isinstance(data.get("ga4"), dict) else {}
    gsc_summary = gsc.get("summary") if isinstance(gsc.get("summary"), dict) else {}
    ga4_summary = ga4.get("summary") if isinstance(ga4.get("summary"), dict) else {}

    top_queries = gsc.get("top_queries") or []
    top_pages = gsc.get("top_pages") or []
    if isinstance(top_queries, list):
        top_queries = top_queries[:10]
    if isinstance(top_pages, list):
        top_pages = top_pages[:10]

    return {
        "fetched_at": data.get("fetched_at"),
        "date_range": data.get("date_range"),
        "gsc": {
            "site_url": gsc.get("site_url"),
            "summary": gsc_summary,
            "top_queries": top_queries,
            "top_pages": top_pages,
        },
        "ga4": {
            "property_id": ga4.get("property_id"),
            "summary": ga4_summary,
            "top_pages": (ga4.get("top_pages") or [])[:10] if isinstance(ga4.get("top_pages"), list) else [],
        },
        "errors": data.get("errors") or [],
        "property_id": scoped.property_id,
    }


def get_gsc_top_queries(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "queries": [], "total": 0}
    gsc = data.get("gsc") if isinstance(data.get("gsc"), dict) else {}
    queries = gsc.get("top_queries") or gsc.get("queries") or []
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(queries if isinstance(queries, list) else [], limit, max_cap=50)
    return {"queries": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_gsc_top_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google(conn)
    if not data:
        return {"error": "no google data found", "pages": [], "total": 0}
    gsc = data.get("gsc") if isinstance(data.get("gsc"), dict) else {}
    pages = gsc.get("top_pages") or gsc.get("pages") or []
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages if isinstance(pages, list) else [], limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_ga4_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    data = scoped.load_google(conn)
    if not data:
        return {"error": "no google data found"}
    ga4 = data.get("ga4") if isinstance(data.get("ga4"), dict) else {}
    if not ga4:
        return {"error": "no GA4 data — connect GA4 property in Integrations", "missing": True}
    top_pages = ga4.get("top_pages") or []
    limit = parse_limit(args.get("limit"), 20, 50)
    sliced = cap_list(top_pages if isinstance(top_pages, list) else [], limit, max_cap=50)
    return {
        "property_id": ga4.get("property_id"),
        "summary": ga4.get("summary") or {},
        "top_pages": sliced["items"],
        "fetched_at": data.get("fetched_at"),
    }


def get_gsc_page_query_slice(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    data = scoped.load_google(conn)
    if not data:
        return {"error": "no google data found"}
    slice_data = slice_from_google_row(data, url)
    return {"url": url, "gsc_ga4": slice_data}


def get_ga4_page_metrics(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    path = str(args.get("path") or args.get("url") or "").strip()
    if not path:
        return {"error": "path or url is required"}
    data = scoped.load_google(conn)
    if not data:
        return {"error": "no google data found"}
    ga4 = data.get("ga4") if isinstance(data.get("ga4"), dict) else {}
    if not ga4:
        return {"error": "no GA4 data", "missing": True}
    from ...integrations.google.normalize import url_to_path

    def _ga4_path_key(raw: str) -> str:
        text = str(raw or "").strip()
        if text.startswith(("http://", "https://")):
            text = url_to_path(text)
        if not text.startswith("/"):
            text = f"/{text}"
        return text.lower().rstrip("/") or "/"

    needle = _ga4_path_key(path)
    for row in ga4.get("top_pages") or []:
        if not isinstance(row, dict):
            continue
        row_path = _ga4_path_key(str(row.get("path") or row.get("page") or ""))
        if row_path == needle:
            return {"path": path, "metrics": row, "fetched_at": data.get("fetched_at")}
    slice_data = slice_from_google_row(data, path)
    ga4_slice = slice_data.get("ga4") if isinstance(slice_data, dict) else None
    if ga4_slice:
        return {"path": path, "metrics": ga4_slice, "fetched_at": data.get("fetched_at")}
    return {"error": "path not found in GA4 top pages", "path": path, "missing": True}
