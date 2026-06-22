"""Issue workflow status persistence (issue_status table)."""
from __future__ import annotations

import hashlib
from typing import Any, Optional

from psycopg import Connection

from ._common import _row_field

_VALID_STATUS = frozenset({"open", "in_progress", "fixed", "ignored"})

_SELECT_COLUMNS = """
    id, property_id, report_id, issue_fingerprint, category_id,
    message, url, priority, status, assignee, note, updated_at
"""


def issue_fingerprint(message: str, url: str, category_id: Optional[str] = None) -> str:
    raw = f"{category_id or ''}|{url or ''}|{message or ''}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def _map_issue_row(row: Any) -> dict[str, Any]:
    report_id = _row_field(row, "report_id")
    updated = _row_field(row, "updated_at")
    return {
        "id": int(_row_field(row, "id")),
        "propertyId": int(_row_field(row, "property_id")),
        "reportId": int(report_id) if report_id is not None else None,
        "issueFingerprint": _row_field(row, "issue_fingerprint"),
        "categoryId": _row_field(row, "category_id"),
        "message": _row_field(row, "message"),
        "url": _row_field(row, "url"),
        "priority": _row_field(row, "priority"),
        "status": _row_field(row, "status"),
        "assignee": _row_field(row, "assignee"),
        "note": _row_field(row, "note"),
        "updatedAt": updated.isoformat() if hasattr(updated, "isoformat") else str(updated or ""),
    }


def list_issue_status(conn: Connection, property_id: int) -> list[dict[str, Any]]:
    cur = conn.execute(
        f"""SELECT {_SELECT_COLUMNS}
            FROM issue_status
            WHERE property_id = %s
            ORDER BY updated_at DESC""",
        (property_id,),
    )
    return [_map_issue_row(row) for row in cur.fetchall() or []]


def upsert_issue_status(
    conn: Connection,
    *,
    property_id: int,
    message: str,
    status: str,
    report_id: int | None = None,
    url: str = "",
    priority: str = "Medium",
    category_id: str | None = None,
    assignee: str | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    if status not in _VALID_STATUS:
        raise ValueError(f"invalid status: {status}")

    fp = issue_fingerprint(message, url, category_id)
    cur = conn.execute(
        f"""INSERT INTO issue_status
             (property_id, report_id, issue_fingerprint, category_id, message, url,
              priority, status, assignee, note, updated_at)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
           ON CONFLICT (property_id, issue_fingerprint) DO UPDATE SET
             status     = EXCLUDED.status,
             assignee   = COALESCE(EXCLUDED.assignee, issue_status.assignee),
             note       = COALESCE(EXCLUDED.note, issue_status.note),
             report_id  = COALESCE(EXCLUDED.report_id, issue_status.report_id),
             updated_at = now()
           RETURNING {_SELECT_COLUMNS}""",
        (
            property_id,
            report_id,
            fp,
            category_id,
            message,
            url,
            priority,
            status,
            assignee,
            note,
        ),
    )
    row = cur.fetchone()
    conn.commit()
    if not row:
        raise RuntimeError("issue status upsert failed")
    return _map_issue_row(row)
