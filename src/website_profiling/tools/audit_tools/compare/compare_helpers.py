"""Shared helpers for compare slice tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ....db.report_store import read_report_payload
from ..context import AuditToolContext


def _row_id(row: Any) -> Any:
    if hasattr(row, "keys"):
        return row["id"]
    return row[0]


def load_compare_pair(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, int | None, int | None, dict[str, Any] | None]:
    """Return (current, baseline, current_rid, baseline_rid, error)."""
    scoped = ctx.with_args(args)
    baseline_id = args.get("baseline_report_id")
    if baseline_id is None:
        return None, None, None, None, {"error": "baseline_report_id is required"}
    try:
        baseline_rid = int(baseline_id)
    except (TypeError, ValueError):
        return None, None, None, None, {"error": "invalid baseline_report_id"}

    current_rid = scoped.report_id
    if current_rid is None:
        cur_row = conn.execute("SELECT id FROM report_payload ORDER BY id DESC LIMIT 1").fetchone()
        if cur_row is None:
            return None, None, None, None, {"error": "no current report found"}
        current_rid = int(_row_id(cur_row))

    current = read_report_payload(conn, current_rid)
    baseline = read_report_payload(conn, baseline_rid)
    if not current:
        return None, None, None, None, {"error": f"report {current_rid} not found"}
    if not baseline:
        return None, None, None, None, {"error": f"report {baseline_rid} not found"}
    return current, baseline, current_rid, baseline_rid, None
