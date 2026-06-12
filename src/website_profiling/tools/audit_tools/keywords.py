"""Keyword query tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...integrations.google.keyword_store import read_keyword_history
from ._slice import cap_list, parse_limit, payload_field
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


def _keyword_list_tool(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    key: str,
    item_key: str,
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required for keyword data"}
    data = scoped.load_keywords(conn)
    if not data:
        return {"error": "no keyword data found", item_key: [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    items = data.get(key) or []
    if key == "semantic_keyword_clusters":
        payload = scoped.load_payload(conn)
        items = payload.get("semantic_keyword_clusters") or items
    sliced = cap_list(items if isinstance(items, list) else [], limit, max_cap=50)
    return {item_key: sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_striking_distance_keywords(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _keyword_list_tool(conn, ctx, args, "striking_distance", "keywords")


def get_keyword_cannibalisation(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _keyword_list_tool(conn, ctx, args, "cannibalisation", "issues")


def get_query_page_misalignment(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _keyword_list_tool(conn, ctx, args, "query_page_misalignment", "misalignments")


def get_semantic_keyword_clusters(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "clusters": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 20, 50)
    return payload_field(payload, "semantic_keyword_clusters", limit, max_cap=50, item_key="clusters")


def get_keyword_history(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    keyword = str(args.get("keyword") or "").strip()
    if not keyword:
        return {"error": "keyword is required"}
    limit = parse_limit(args.get("limit"), 30, 50)
    rows = read_keyword_history(conn, keyword, limit=limit, property_id=scoped.property_id)
    return {"keyword": keyword, "history": rows, "count": len(rows)}


def _filter_keyword_rows(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    predicate: Any,
) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required", "keywords": [], "total": 0, "truncated": False}
    data = scoped.load_keywords(conn)
    if not data:
        return {"error": "no keyword data found", "keywords": [], "total": 0, "truncated": False}
    rows = data.get("rows") or []
    matches = [r for r in rows if isinstance(r, dict) and predicate(r)]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(matches, limit, max_cap=50)
    return {"keywords": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_keyword_serp_overlay(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    data = scoped.load_keywords(conn)
    if not data:
        return {"error": "no keyword data found", "keywords": [], "total": 0, "truncated": False}
    rows = data.get("rows") or []
    with_serp = [
        r for r in rows
        if isinstance(r, dict) and r.get("serp_estimated_competition") is not None
    ]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(with_serp, limit, max_cap=50)
    return {
        "serp_overlay_count": data.get("serp_overlay_count"),
        "keywords": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def list_keywords_by_action(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    action = str(args.get("recommended_action") or "").strip().lower()
    if not action:
        return {"error": "recommended_action is required"}
    return _filter_keyword_rows(
        conn, ctx, args,
        lambda r: str(r.get("recommended_action") or "").lower() == action,
    )


def list_keywords_ctr_opportunity(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Keywords flagged for CTR improvement (title/meta snippet optimization)."""
    return _filter_keyword_rows(
        conn, ctx, args,
        lambda r: "improve ctr" in str(r.get("recommended_action") or "").lower(),
    )


def list_keywords_by_position(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    min_pos = args.get("min_position")
    max_pos = args.get("max_position")
    try:
        min_v = float(min_pos) if min_pos is not None else None
        max_v = float(max_pos) if max_pos is not None else None
    except (TypeError, ValueError):
        return {"error": "min_position and max_position must be numbers"}

    def _in_range(row: dict[str, Any]) -> bool:
        pos = row.get("gsc_position")
        try:
            p = float(pos)
        except (TypeError, ValueError):
            return False
        if min_v is not None and p < min_v:
            return False
        if max_v is not None and p > max_v:
            return False
        return True

    return _filter_keyword_rows(conn, ctx, args, _in_range)


def list_keywords_by_impressions(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    min_impr = args.get("min_impressions")
    try:
        min_v = int(min_impr) if min_impr is not None else 0
    except (TypeError, ValueError):
        return {"error": "min_impressions must be an integer"}
    def _impressions(row: dict[str, Any]) -> int:
        raw = row.get("gsc_impressions")
        try:
            return int(float(raw)) if raw is not None else 0
        except (TypeError, ValueError):
            return 0

    return _filter_keyword_rows(
        conn, ctx, args,
        lambda r: _impressions(r) >= min_v,
    )
