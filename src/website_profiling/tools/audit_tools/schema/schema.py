"""Schema markup audit tools (read-only, from crawl data)."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from .._slice import crawl_filter, parse_limit
from ..context import AuditToolContext


def get_schema_coverage(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"error": "no crawl data", "with_schema": 0, "without_schema": 0, "total": 0}
    total = len(df)
    with_schema = 0
    type_counts: dict[str, int] = {}
    for _, row in df.iterrows():
        rec = row.to_dict()
        has = str(rec.get("has_schema") or "").lower() in ("true", "1", "yes")
        if has:
            with_schema += 1
        from .._slice import _row_schema_types_list  # noqa: PLC0415

        for t in _row_schema_types_list(rec):
            type_counts[t] = type_counts.get(t, 0) + 1
    top_types = sorted(type_counts.items(), key=lambda x: -x[1])[:20]
    return {
        "total_pages": total,
        "with_schema": with_schema,
        "without_schema": total - with_schema,
        "coverage_pct": round(100 * with_schema / total, 1) if total else 0,
        "top_schema_types": [{"type": k, "count": v} for k, v in top_types],
    }


def list_pages_without_schema(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    limit = parse_limit(args.get("limit"), 30, 30)
    return crawl_filter(df, has_schema=False, limit=limit)


def search_pages_by_schema_type(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    schema_type = str(args.get("schema_type") or "").strip()
    if not schema_type:
        return {"error": "schema_type is required"}
    df = scoped.load_crawl_df(conn)
    limit = parse_limit(args.get("limit"), 30, 30)
    return crawl_filter(df, schema_type=schema_type, limit=limit)
