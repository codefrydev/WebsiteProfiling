"""
Read/write keyword_data, keyword_history, and keyword_suggest_cache tables.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ...db.storage import _parse_json_field, _sanitize_for_json


def write_keyword_data(conn: Connection, data: dict[str, Any]) -> None:
    """Insert a new keyword_data snapshot."""
    fetched_at = data.get("fetched_at") or datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO keyword_data (fetched_at, data) VALUES (%s, %s)",
        (fetched_at, Json(_sanitize_for_json(data))),
    )
    conn.commit()


def read_latest_keyword_data(conn: Connection) -> dict[str, Any] | None:
    """Return the latest keyword_data row stripped of full history blobs."""
    try:
        cur = conn.execute("SELECT data FROM keyword_data ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_json_field(row["data"])
        if not isinstance(data, dict):
            return None
        if isinstance(data.get("rows"), list) and len(data["rows"]) > 1000:
            data["rows"] = data["rows"][:1000]
        return data
    except Exception:
        return None


def append_keyword_history(conn: Connection, rows: list[dict[str, Any]]) -> None:
    """Append per-keyword time-series rows for position tracking."""
    fetched_at = datetime.now(timezone.utc).isoformat()
    conn.executemany(
        """INSERT INTO keyword_history (keyword, fetched_at, position, clicks, impressions, ctr)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        [
            (
                r.get("keyword", ""),
                r.get("fetched_at", fetched_at),
                r.get("position"),
                r.get("clicks"),
                r.get("impressions"),
                r.get("ctr"),
            )
            for r in rows
            if r.get("keyword")
        ],
    )
    conn.commit()


def read_keyword_history(
    conn: Connection,
    keyword: str,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Return time-series rows for a single keyword (for sparklines)."""
    try:
        cur = conn.execute(
            """SELECT fetched_at, position, clicks, impressions, ctr
               FROM keyword_history WHERE keyword = %s ORDER BY id DESC LIMIT %s""",
            (keyword, limit),
        )
        return [
            {
                "fetched_at": row["fetched_at"],
                "position": row["position"],
                "clicks": row["clicks"],
                "impressions": row["impressions"],
                "ctr": row["ctr"],
            }
            for row in cur.fetchall()
        ]
    except Exception:
        return []
