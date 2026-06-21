"""Category-scoped issue query tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ....reporting.terminology import category_display_name
from ..context import AuditToolContext
from ..report.report import _health_score, _iter_category_issues, list_issues


def list_issues_by_category(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    category_id = str(args.get("category_id") or "").strip()
    if not category_id:
        return {"error": "category_id is required"}
    return list_issues(conn, ctx, {**args, "category_id": category_id})


def get_category_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    category_id = str(args.get("category_id") or "").strip()
    if not category_id:
        return {"error": "category_id is required"}
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        if str(cat.get("id") or "") != category_id:
            continue
        issues = _iter_category_issues({"categories": [cat]})
        return {
            "category_id": category_id,
            "name": category_display_name(str(cat.get("name") or category_id)),
            "score": cat.get("score"),
            "issues": issues,
            "issue_count": len(issues),
        }
    return {"error": f"category {category_id} not found", "category_id": category_id}
