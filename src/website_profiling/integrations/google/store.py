"""
Read/write the google_data SQLite table.
The table stores the latest Google data snapshot (GSC + GA4).
Data survives report rebuilds because it is in a separate table from report_payload.
"""
from __future__ import annotations

import json
import sqlite3
import time
from typing import Any, Optional


TABLE_DDL = """
CREATE TABLE IF NOT EXISTS google_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fetched_at TEXT NOT NULL,
    data TEXT NOT NULL
);
"""


def ensure_table(conn: sqlite3.Connection) -> None:
    conn.execute(TABLE_DDL)
    conn.commit()


def write_google_data(conn: sqlite3.Connection, data: dict[str, Any]) -> None:
    """Insert a new google_data row. Older rows are kept (historical)."""
    ensure_table(conn)
    fetched_at = data.get("fetched_at") or time.strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "INSERT INTO google_data (fetched_at, data) VALUES (?, ?)",
        (fetched_at, json.dumps(data, default=str)),
    )
    conn.commit()


def read_latest_google_data(conn: sqlite3.Connection) -> Optional[dict[str, Any]]:
    """
    Return the latest google_data row as a dict suitable for report_payload["google"].
    Strips full by_page/by_path from the returned dict (those are only for SQLite lookups).
    Returns None if no data exists.
    """
    ensure_table(conn)
    try:
        cur = conn.execute(
            "SELECT data FROM google_data ORDER BY id DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row is None:
            return None
        data = json.loads(row[0])
        # Return payload-safe subset (no full by_page / by_path blobs)
        return _to_payload_shape(data)
    except Exception:
        return None


def _to_payload_shape(data: dict[str, Any]) -> dict[str, Any]:
    """Strip gsc_full/ga4_full keys from the payload -- those stay in SQLite."""
    result = {k: v for k, v in data.items() if k not in ("gsc_full", "ga4_full")}
    return result
