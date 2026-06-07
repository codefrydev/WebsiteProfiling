"""Health history query tools."""
from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

from ...db._common import _row_field
from .context import AuditToolContext


def get_health_history(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    property_id = scoped.property_id
    if property_id is None:
        return {"error": "property_id is required"}

    limit = args.get("limit", 10)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 30))

    cur = conn.execute(
        """SELECT health_score, category_scores, issue_counts, generated_at, report_id
           FROM audit_health_snapshots
           WHERE property_id = %s
           ORDER BY generated_at DESC, id DESC
           LIMIT %s""",
        (property_id, limit),
    )
    snapshots = []
    for row in cur.fetchall() or []:
        cat_scores = _row_field(row, "category_scores", index=1)
        issue_counts = _row_field(row, "issue_counts", index=2)
        if isinstance(cat_scores, str):
            try:
                cat_scores = json.loads(cat_scores)
            except json.JSONDecodeError:
                cat_scores = {}
        if isinstance(issue_counts, str):
            try:
                issue_counts = json.loads(issue_counts)
            except json.JSONDecodeError:
                issue_counts = {}
        gen = _row_field(row, "generated_at", index=3)
        snapshots.append({
            "health_score": _row_field(row, "health_score", index=0),
            "category_scores": cat_scores,
            "issue_counts": issue_counts,
            "generated_at": gen.isoformat() if hasattr(gen, "isoformat") else str(gen or ""),
            "report_id": _row_field(row, "report_id", index=4),
        })

    return {
        "property_id": property_id,
        "snapshots": snapshots,
        "count": len(snapshots),
    }
