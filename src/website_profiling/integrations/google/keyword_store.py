"""
Read/write keyword_data, keyword_history, and keyword_suggest_cache SQLite tables.

keyword_data:          latest enriched keyword snapshot (one JSON blob per run)
keyword_history:       per-keyword time-series rows for position sparklines
keyword_suggest_cache: cache for Google Suggest responses (TTL-based)
"""
from __future__ import annotations

import json
import sqlite3
import time
from datetime import datetime, timezone
from typing import Any

TABLE_DDL = """
CREATE TABLE IF NOT EXISTS keyword_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fetched_at TEXT NOT NULL,
    data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keyword_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    position REAL,
    clicks INTEGER,
    impressions INTEGER,
    ctr REAL
);
CREATE INDEX IF NOT EXISTS idx_kw_history_keyword ON keyword_history(keyword);

CREATE TABLE IF NOT EXISTS keyword_suggest_cache (
    cache_key TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL,
    data TEXT NOT NULL
);
"""


def ensure_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(TABLE_DDL)
    conn.commit()


# ── keyword_data ──────────────────────────────────────────────────────────────

def write_keyword_data(conn: sqlite3.Connection, data: dict[str, Any]) -> None:
    """Insert a new keyword_data snapshot."""
    ensure_tables(conn)
    fetched_at = data.get("fetched_at") or datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO keyword_data (fetched_at, data) VALUES (?, ?)",
        (fetched_at, json.dumps(data, default=str)),
    )
    conn.commit()


def read_latest_keyword_data(conn: sqlite3.Connection) -> dict[str, Any] | None:
    """
    Return the latest keyword_data row stripped of full history blobs.
    Rows are capped at 500 for the payload.
    """
    ensure_tables(conn)
    try:
        cur = conn.execute(
            "SELECT data FROM keyword_data ORDER BY id DESC LIMIT 1"
        )
        row = cur.fetchone()
        if row is None:
            return None
        data = json.loads(row[0])
        # Cap rows for payload to avoid bloat
        if isinstance(data.get("rows"), list) and len(data["rows"]) > 1000:
            data["rows"] = data["rows"][:1000]
        return data
    except Exception:
        return None


# ── keyword_history ───────────────────────────────────────────────────────────

def append_keyword_history(conn: sqlite3.Connection, rows: list[dict[str, Any]]) -> None:
    """Append per-keyword time-series rows for position tracking."""
    ensure_tables(conn)
    fetched_at = datetime.now(timezone.utc).isoformat()
    conn.executemany(
        "INSERT INTO keyword_history (keyword, fetched_at, position, clicks, impressions, ctr) "
        "VALUES (?, ?, ?, ?, ?, ?)",
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
    conn: sqlite3.Connection,
    keyword: str,
    limit: int = 30,
) -> list[dict[str, Any]]:
    """Return time-series rows for a single keyword (for sparklines)."""
    ensure_tables(conn)
    try:
        cur = conn.execute(
            "SELECT fetched_at, position, clicks, impressions, ctr "
            "FROM keyword_history WHERE keyword = ? ORDER BY id DESC LIMIT ?",
            (keyword, limit),
        )
        return [
            {
                "fetched_at": row[0],
                "position": row[1],
                "clicks": row[2],
                "impressions": row[3],
                "ctr": row[4],
            }
            for row in cur.fetchall()
        ]
    except Exception:
        return []
