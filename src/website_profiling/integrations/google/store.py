"""
Read/write the google_data table.
The table stores the latest Google data snapshot (GSC + GA4).
"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from psycopg import Connection
from psycopg.types.json import Json

from ...db.storage import _parse_row_json, _sanitize_for_json


def write_google_data(
    conn: Connection,
    data: dict[str, Any],
    property_id: int | None = None,
) -> None:
    """Insert a new google_data row. Older rows are kept (historical)."""
    fetched_at = data.get("fetched_at") or time.strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "INSERT INTO google_data (fetched_at, data, property_id) VALUES (%s, %s, %s)",
        (fetched_at, Json(_sanitize_for_json(data)), property_id),
    )
    conn.commit()


def read_latest_google_data(
    conn: Connection,
    property_id: int | None = None,
) -> Optional[dict[str, Any]]:
    """
    Return the latest google_data row as a dict suitable for report_payload["google"].
    When property_id is set, scope to that property; else global latest (legacy).
    Strips full by_page/by_path from the returned dict (those stay in DB for lookups).
    """
    try:
        if property_id is not None:
            cur = conn.execute(
                """
                SELECT data FROM google_data
                WHERE property_id = %s
                ORDER BY id DESC LIMIT 1
                """,
                (property_id,),
            )
        else:
            cur = conn.execute("SELECT data FROM google_data ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_row_json(row)
        if not isinstance(data, dict):
            return None
        return _to_payload_shape(data)
    except Exception:
        return None


def _to_payload_shape(data: dict[str, Any]) -> dict[str, Any]:
    """Strip gsc_full/ga4_full keys from the payload."""
    return {k: v for k, v in data.items() if k not in ("gsc_full", "ga4_full")}


def read_google_data_full(
    conn: Connection,
    property_id: int | None = None,
) -> Optional[dict[str, Any]]:
    """Return latest google_data row including gsc_full and ga4_full blobs."""
    try:
        if property_id is not None:
            cur = conn.execute(
                """
                SELECT data FROM google_data
                WHERE property_id = %s
                ORDER BY id DESC LIMIT 1
                """,
                (property_id,),
            )
        else:
            cur = conn.execute("SELECT data FROM google_data ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_row_json(row)
        return data if isinstance(data, dict) else None
    except Exception:
        return None
