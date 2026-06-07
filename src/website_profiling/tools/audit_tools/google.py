"""Google Search Console / GA4 summary tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

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
