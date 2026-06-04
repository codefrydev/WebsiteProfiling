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

from ...db.storage import _parse_json_field, _sanitize_for_json


def write_google_data(conn: Connection, data: dict[str, Any]) -> None:
    """Insert a new google_data row. Older rows are kept (historical)."""
    fetched_at = data.get("fetched_at") or time.strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "INSERT INTO google_data (fetched_at, data) VALUES (%s, %s)",
        (fetched_at, Json(_sanitize_for_json(data))),
    )
    conn.commit()


def read_latest_google_data(conn: Connection) -> Optional[dict[str, Any]]:
    """
    Return the latest google_data row as a dict suitable for report_payload["google"].
    Strips full by_page/by_path from the returned dict (those stay in DB for lookups).
    """
    try:
        cur = conn.execute("SELECT data FROM google_data ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_json_field(row["data"])
        if not isinstance(data, dict):
            return None
        return _to_payload_shape(data)
    except Exception:
        return None


def _to_payload_shape(data: dict[str, Any]) -> dict[str, Any]:
    """Strip gsc_full/ga4_full keys from the payload."""
    return {k: v for k, v in data.items() if k not in ("gsc_full", "ga4_full")}
