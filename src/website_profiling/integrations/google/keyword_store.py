"""
Read/write keyword_data, keyword_history, and keyword_suggest_cache tables.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ...db._common import _parse_row_json, _row_field, _sanitize_for_json


def write_keyword_data(
    conn: Connection,
    data: dict[str, Any],
    *,
    property_id: int | None = None,
) -> None:
    """Insert a new keyword_data snapshot scoped to property_id."""
    if property_id is None:
        raise RuntimeError(
            "property_id is required to store keyword data. Set Site URL and active_property_id."
        )
    fetched_at = data.get("fetched_at") or datetime.now(timezone.utc).isoformat()
    if property_id is not None:
        data = {**data, "property_id": property_id}
    conn.execute(
        "INSERT INTO keyword_data (fetched_at, data, property_id) VALUES (%s, %s, %s)",
        (fetched_at, Json(_sanitize_for_json(data)), property_id),
    )
    conn.commit()


def read_latest_keyword_data(
    conn: Connection,
    property_id: int | None = None,
) -> dict[str, Any] | None:
    """Return the latest keyword_data row for property_id (no global fallback)."""
    if property_id is None:
        return None
    try:
        cur = conn.execute(
            """
            SELECT data FROM keyword_data
            WHERE property_id = %s
            ORDER BY id DESC LIMIT 1
            """,
            (property_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_row_json(row)
        if not isinstance(data, dict):
            return None
        if isinstance(data.get("rows"), list) and len(data["rows"]) > 1000:
            data["rows"] = data["rows"][:1000]
        return data
    except Exception:
        return None


def append_keyword_history(
    conn: Connection,
    rows: list[dict[str, Any]],
    *,
    property_id: int | None = None,
) -> None:
    """Append per-keyword time-series rows for position tracking."""
    if property_id is None:
        return
    fetched_at = datetime.now(timezone.utc).isoformat()
    params = [
        (
            property_id,
            r.get("keyword", ""),
            r.get("fetched_at", fetched_at),
            r.get("position"),
            r.get("clicks"),
            r.get("impressions"),
            r.get("ctr"),
        )
        for r in rows
        if r.get("keyword")
    ]
    if not params:
        return
    with conn.cursor() as cur:
        cur.executemany(
            """INSERT INTO keyword_history
               (property_id, keyword, fetched_at, position, clicks, impressions, ctr)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            params,
        )
    conn.commit()


def read_keyword_snapshots_for_property(
    conn: Connection,
    property_id: int | None,
    *,
    limit: int = 2,
) -> list[dict[str, Any]]:
    """Return the most recent keyword_data snapshots for rank delta tools."""
    if property_id is None:
        return []
    try:
        cur = conn.execute(
            """
            SELECT fetched_at, data FROM keyword_data
            WHERE property_id = %s
            ORDER BY id DESC
            LIMIT %s
            """,
            (property_id, max(1, int(limit))),
        )
        out: list[dict[str, Any]] = []
        for row in cur.fetchall():
            data = _parse_row_json(row, "data", index=1)
            if isinstance(data, dict):
                fetched = _row_field(row, "fetched_at", index=0)
                out.append({
                    "fetched_at": fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched or ""),
                    **data,
                })
        return out
    except Exception:
        return []


def read_keyword_history(
    conn: Connection,
    keyword: str,
    limit: int = 30,
    *,
    property_id: int | None = None,
) -> list[dict[str, Any]]:
    """Return time-series rows for a single keyword (for sparklines)."""
    if property_id is None:
        return []
    try:
        cur = conn.execute(
            """SELECT fetched_at, position, clicks, impressions, ctr
               FROM keyword_history
               WHERE property_id = %s AND keyword = %s
               ORDER BY id DESC LIMIT %s""",
            (property_id, keyword, limit),
        )
        rows = list(cur.fetchall() or [])
        return [_map_keyword_history_row(row) for row in reversed(rows)]
    except Exception:
        return []


def read_keyword_history_batch(
    conn: Connection,
    keywords: list[str],
    *,
    property_id: int,
    limit: int = 30,
) -> dict[str, list[dict[str, Any]]]:
    """Batch keyword history keyed by keyword string."""
    limit = max(1, min(int(limit), 90))
    results: dict[str, list[dict[str, Any]]] = {}
    for kw in keywords:
        results[kw] = read_keyword_history(conn, kw, limit, property_id=property_id)
    return results


def _map_keyword_history_row(row: Any) -> dict[str, Any]:
    fetched = _row_field(row, "fetched_at", index=0)
    return {
        "fetched_at": fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched or ""),
        "position": _row_field(row, "position", index=1),
        "clicks": _row_field(row, "clicks", index=2),
        "impressions": _row_field(row, "impressions", index=3),
        "ctr": _row_field(row, "ctr", index=4),
    }
