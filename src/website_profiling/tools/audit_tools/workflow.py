"""Issue workflow status tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...db._common import _row_field
from ._slice import parse_limit
from .context import AuditToolContext


def list_issue_workflow(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    limit = parse_limit(args.get("limit"), 50, 50)
    status_filter = str(args.get("status") or "").strip()
    cur = conn.execute(
        """SELECT issue_key, url, category, priority, message, status, assignee, note, updated_at
           FROM issue_status
           WHERE property_id = %s
           ORDER BY updated_at DESC
           LIMIT %s""",
        (scoped.property_id, limit),
    )
    rows = []
    for row in cur.fetchall() or []:
        st = str(_row_field(row, "status", index=5) or "")
        if status_filter and st != status_filter:
            continue
        updated = _row_field(row, "updated_at", index=8)
        rows.append({
            "issue_key": _row_field(row, "issue_key", index=0),
            "url": _row_field(row, "url", index=1),
            "category": _row_field(row, "category", index=2),
            "priority": _row_field(row, "priority", index=3),
            "message": _row_field(row, "message", index=4),
            "status": st,
            "assignee": _row_field(row, "assignee", index=6),
            "note": _row_field(row, "note", index=7),
            "updated_at": updated.isoformat() if hasattr(updated, "isoformat") else str(updated or ""),
        })
    return {"issues": rows, "count": len(rows), "property_id": scoped.property_id}
