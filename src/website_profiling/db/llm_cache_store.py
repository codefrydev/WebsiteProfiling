"""LLM response cache."""
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
    _sanitize_for_json,
)
from .pool import db_session, get_data_dir, get_database_url

def read_llm_cache(conn: Connection, cache_key: str) -> Optional[str]:
    try:
        cur = conn.execute("SELECT response_json FROM llm_cache WHERE cache_key = %s", (cache_key,))
        row = cur.fetchone()
        if not row:
            return None
        val = row["response_json"]
        if val is None:
            return None
        return json.dumps(val) if isinstance(val, (dict, list)) else str(val)
    except Exception:
        return None


def write_llm_cache(conn: Connection, cache_key: str, response_json: str) -> None:
    now = _now_iso()
    try:
        payload = json.loads(response_json)
    except json.JSONDecodeError:
        payload = response_json
    conn.execute(
        """INSERT INTO llm_cache (cache_key, response_json, created_at)
           VALUES (%s, %s, %s)
           ON CONFLICT (cache_key) DO UPDATE SET response_json = EXCLUDED.response_json, created_at = EXCLUDED.created_at""",
        (cache_key, _json_val(payload), now),
    )
    conn.commit()


def read_llm_cache_batch(conn: Connection, cache_keys: list[str]) -> dict[str, dict[str, Any]]:
    if not cache_keys:
        return {}
    out: dict[str, dict[str, Any]] = {}
    try:
        cur = conn.execute(
            "SELECT cache_key, response_json FROM llm_cache WHERE cache_key = ANY(%s)",
            (cache_keys,),
        )
        for row in cur.fetchall():
            key = str(row["cache_key"])
            val = row["response_json"]
            if isinstance(val, dict):
                out[key] = val
            elif isinstance(val, str):
                try:
                    out[key] = json.loads(val)
                except json.JSONDecodeError:
                    pass
    except Exception:
        pass
    return out

