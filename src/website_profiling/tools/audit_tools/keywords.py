"""Keyword query tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from .context import AuditToolContext

_KEYWORD_LIMIT_DEFAULT = 20
_KEYWORD_LIMIT_MAX = 50


def get_keyword_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required for keyword data"}

    data = scoped.load_keywords(conn)
    if not data:
        return {"error": "no keyword data found", "property_id": scoped.property_id}

    rows = data.get("rows") or []
    if not isinstance(rows, list):
        rows = []

    striking = data.get("striking_distance") or []
    striking_count = len(striking) if isinstance(striking, list) else 0

    top_n = args.get("limit", _KEYWORD_LIMIT_DEFAULT)
    try:
        top_n = int(top_n)
    except (TypeError, ValueError):
        top_n = _KEYWORD_LIMIT_DEFAULT
    top_n = max(1, min(top_n, _KEYWORD_LIMIT_MAX))

    top_rows = []
    for row in rows[:top_n]:
        if not isinstance(row, dict):
            continue
        top_rows.append({
            "keyword": row.get("keyword"),
            "score": row.get("score"),
            "gsc_position": row.get("gsc_position"),
            "gsc_clicks": row.get("gsc_clicks"),
            "gsc_impressions": row.get("gsc_impressions"),
            "recommended_action": row.get("recommended_action"),
        })

    return {
        "fetched_at": data.get("fetched_at"),
        "total_keywords": data.get("total_keywords") or len(rows),
        "striking_distance_count": striking_count,
        "top_keywords": top_rows,
        "property_id": scoped.property_id,
    }


def search_keywords(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required for keyword data"}

    query = str(args.get("query") or "").strip().lower()
    if not query:
        return {"error": "query is required"}

    data = scoped.load_keywords(conn)
    if not data:
        return {"error": "no keyword data found", "keywords": [], "total": 0}

    rows = data.get("rows") or []
    matches = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        kw = str(row.get("keyword") or "").lower()
        if query in kw:
            matches.append({
                "keyword": row.get("keyword"),
                "gsc_position": row.get("gsc_position"),
                "gsc_clicks": row.get("gsc_clicks"),
                "gsc_impressions": row.get("gsc_impressions"),
                "recommended_action": row.get("recommended_action"),
            })

    limit = 30
    total = len(matches)
    return {
        "keywords": matches[:limit],
        "total": total,
        "truncated": total > limit,
    }
