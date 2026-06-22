"""Pipeline and LLM config tables."""
from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Optional

import pandas as pd
from psycopg import Connection
from urllib.parse import urlparse

from ._common import (
    _executemany,
    _json_val,
    _now_iso,
    _parse_json_field,
    _row_field,
    _sanitize_for_json,
)
from .pool import db_session, get_data_dir, get_database_url

def read_pipeline_config(conn: Connection) -> tuple[dict[str, str], list[dict[str, str]]]:
    try:
        cur = conn.execute("SELECT key, value, is_unknown FROM pipeline_config ORDER BY key")
        rows = cur.fetchall()
        known: dict[str, str] = {}
        unknown: list[dict[str, str]] = []
        for row in rows:
            k, v = str(row["key"]), str(row["value"])
            if row["is_unknown"]:
                unknown.append({"key": k, "value": v})
            else:
                known[k] = v
        return known, unknown
    except Exception:
        return {}, []


def write_pipeline_config(
    conn: Connection,
    entries: dict[str, str],
    unknown_keys: list[dict[str, str]] | None = None,
) -> None:
    now = _now_iso()
    if unknown_keys is None:
        unknown_keys = []
    with conn.transaction():
        conn.execute("DELETE FROM pipeline_config")
        for k, v in entries.items():
            conn.execute(
                "INSERT INTO pipeline_config (key, value, is_unknown, updated_at) VALUES (%s, %s, false, %s)",
                (str(k), str(v), now),
            )
        for item in unknown_keys:
            conn.execute(
                """INSERT INTO pipeline_config (key, value, is_unknown, updated_at)
                   VALUES (%s, %s, true, %s)
                   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, is_unknown = true, updated_at = EXCLUDED.updated_at""",
                (str(item["key"]), str(item.get("value", "")), now),
            )


def read_llm_config(conn: Connection) -> dict[str, str]:
    try:
        cur = conn.execute("SELECT key, value FROM llm_config ORDER BY key")
        return {str(row["key"]): str(row["value"]) for row in cur.fetchall()}
    except Exception:
        return {}


def write_llm_config(conn: Connection, entries: dict[str, str], secret_keys: set[str] | None = None) -> None:
    now = _now_iso()
    secret_keys = secret_keys or set()
    with conn.transaction():
        conn.execute("DELETE FROM llm_config")
        for k, v in entries.items():
            conn.execute(
                "INSERT INTO llm_config (key, value, is_secret, updated_at) VALUES (%s, %s, %s, %s)",
                (str(k), str(v), k in secret_keys, now),
            )


def read_llm_config_full(conn: Connection) -> list[dict[str, Any]]:
    """Return llm_config rows including the is_secret flag."""
    try:
        cur = conn.execute("SELECT key, value, is_secret FROM llm_config ORDER BY key")
        return [
            {
                "key": str(_row_field(row, "key", index=0)),
                "value": str(_row_field(row, "value", index=1)),
                "is_secret": bool(_row_field(row, "is_secret", index=2)),
            }
            for row in cur.fetchall() or []
        ]
    except Exception:
        return []


def read_app_setting(conn: Connection, key: str) -> str | None:
    try:
        cur = conn.execute("SELECT value FROM app_settings WHERE key = %s", (key,))
        row = cur.fetchone()
        if not row:
            return None
        val = _row_field(row, "value", index=0)
        return str(val) if val is not None else None
    except Exception:
        return None


def write_app_setting(conn: Connection, key: str, value: str) -> None:
    conn.execute(
        """INSERT INTO app_settings (key, value, updated_at)
           VALUES (%s, %s, now())
           ON CONFLICT (key) DO UPDATE
             SET value = EXCLUDED.value,
                 updated_at = now()""",
        (key, value),
    )
    conn.commit()
