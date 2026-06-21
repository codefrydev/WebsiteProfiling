"""On-page SEO issue tools from content_urls and crawl data."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from .._slice import cap_list, parse_limit
from ..context import AuditToolContext

_CONTENT_BUCKETS = frozenset({
    "missing_h1",
    "missing_title",
    "multiple_h1",
    "missing_meta_desc",
    "meta_desc_short",
    "meta_desc_long",
    "thin_content",
})


def _content_urls_bucket(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    bucket: str,
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "items": [], "total": 0, "truncated": False}
    content_urls = payload.get("content_urls") or {}
    if not isinstance(content_urls, dict):
        return {"error": "content_urls not in report", "missing": True, "items": [], "total": 0, "truncated": False}
    items = content_urls.get(bucket) or []
    if not isinstance(items, list):
        items = []
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(items, limit, max_cap=50)
    return {
        "bucket": bucket,
        "items": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def list_content_url_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    bucket = str(args.get("bucket") or "").strip()
    if bucket not in _CONTENT_BUCKETS:
        return {
            "error": f"bucket must be one of: {', '.join(sorted(_CONTENT_BUCKETS))}",
            "items": [],
            "total": 0,
            "truncated": False,
        }
    return _content_urls_bucket(conn, ctx, args, bucket)


def list_pages_missing_title(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _content_urls_bucket(conn, ctx, args, "missing_title")


def list_pages_missing_h1(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _content_urls_bucket(conn, ctx, args, "missing_h1")


def list_pages_multiple_h1(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _content_urls_bucket(conn, ctx, args, "multiple_h1")


def list_pages_missing_meta_description(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _content_urls_bucket(conn, ctx, args, "missing_meta_desc")


def list_pages_meta_desc_too_short(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _content_urls_bucket(conn, ctx, args, "meta_desc_short")


def list_pages_meta_desc_too_long(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _content_urls_bucket(conn, ctx, args, "meta_desc_long")


def list_seo_onpage_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "issues": [], "total": 0, "truncated": False}
    issues = payload.get("issues") or {}
    seo = issues.get("seo") if isinstance(issues, dict) else []
    if not isinstance(seo, list):
        seo = []
    issue_type = str(args.get("issue_type") or "").strip().lower()
    if issue_type:
        seo = [x for x in seo if isinstance(x, dict) and str(x.get("type") or "").lower() == issue_type]
    limit = parse_limit(args.get("limit"), 50, 50)
    sliced = cap_list(seo, limit, max_cap=50)
    return {"issues": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_pages_noindex(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False}
    if "noindex" not in df.columns:
        return {"pages": [], "total": 0, "truncated": False, "note": "noindex column not in crawl"}
    records = df.to_dict(orient="records")
    pages = []
    for r in records:
        val = str(r.get("noindex") or "").lower()
        if val not in ("true", "1", "yes"):
            continue
        pages.append({
            "url": str(r.get("url") or ""),
            "status": str(r.get("status") or ""),
            "title": str(r.get("title") or ""),
        })
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
