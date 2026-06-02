"""Shared DB helpers (JSON, batch execute, timestamps)."""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any

import psycopg
from psycopg import Connection
from psycopg.types.json import Json

def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _json_val(obj: Any) -> Json:
    return Json(_sanitize_for_json(obj))


def _parse_json_field(val: Any) -> Any:
    if val is None:
        return None
    if isinstance(val, (dict, list)):
        return val
    if isinstance(val, str):
        try:
            return json.loads(val)
        except json.JSONDecodeError:
            return val
    return val


def _sanitize_for_json(obj: Any) -> Any:
    """Recursively replace NaN/Inf and numpy types so JSON is valid."""
    if obj is None:
        return None
    if isinstance(obj, (bool, str)):
        return obj
    if isinstance(obj, int):
        return int(obj)
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    if hasattr(obj, "item"):
        try:
            return _sanitize_for_json(obj.item())
        except (ValueError, AttributeError):
            return None
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    return obj


def _executemany(conn: Connection, sql: str, params: list, *, page_size: int = 500) -> None:
    if not params:
        return
    with conn.cursor() as cur:
        for i in range(0, len(params), page_size):
            cur.executemany(sql, params[i : i + page_size])


