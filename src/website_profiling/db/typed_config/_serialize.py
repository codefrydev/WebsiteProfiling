"""Convert between DB column types and flat pipeline state strings."""
from __future__ import annotations

import json
from datetime import datetime
from typing import Any


def bool_to_state_string(value: bool) -> str:
    return "true" if value else "false"


def parse_bool(raw: str | None, *, default: bool = False) -> bool:
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("true", "1", "yes")


def int_to_state_string(value: int | None) -> str:
    if value is None:
        return ""
    return str(value)


def parse_int(raw: str | None, *, default: int | None = None) -> int | None:
    if raw is None or str(raw).strip() == "":
        return default
    try:
        return int(str(raw).strip())
    except ValueError:
        return default


def json_to_state_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, separators=(",", ":"))


def parse_json(raw: str | None) -> Any:
    if raw is None or str(raw).strip() == "":
        return None
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(str(raw))
    except json.JSONDecodeError:
        return str(raw)


def column_from_row(row: Any, column: str, index: int | None = None) -> Any:
    if row is None:
        return None
    if isinstance(row, dict):
        return row.get(column)
    if index is not None:
        try:
            return row[index]
        except (IndexError, TypeError, KeyError):
            return None
    return None


def parse_column_value(col_spec: dict, raw: Any) -> Any:
    col_type = col_spec.get("type", "text")
    if raw is None:
        if col_type == "bool":
            return bool(col_spec.get("default", False))
        if col_type == "int":
            return col_spec.get("default")
        if col_type == "jsonb":
            return col_spec.get("default")
        return col_spec.get("default", "")
    if col_type == "bool":
        default = bool(col_spec.get("default", False))
        if isinstance(raw, bool):
            return raw
        return parse_bool(str(raw), default=default)
    if col_type == "int":
        default = col_spec.get("default")
        if isinstance(raw, int):
            return raw
        return parse_int(str(raw), default=default if default is not None else None)
    if col_type == "jsonb":
        return parse_json(raw if isinstance(raw, str) else json.dumps(raw))
    if col_type == "timestamptz":
        if isinstance(raw, datetime):
            return raw
        if raw == "":
            return None
        return raw
    return str(raw)


def serialize_column_value(col_spec: dict, value: Any) -> Any:
    col_type = col_spec.get("type", "text")
    if col_type == "bool":
        if isinstance(value, bool):
            return value
        return parse_bool(str(value), default=bool(col_spec.get("default", False)))
    if col_type == "int":
        if value is None or value == "":
            return col_spec.get("default")
        if isinstance(value, int):
            return value
        parsed = parse_int(str(value), default=col_spec.get("default"))
        return parsed if parsed is not None else col_spec.get("default")
    if col_type == "jsonb":
        return parse_json(value if isinstance(value, str) else json.dumps(value) if value is not None else None)
    if col_type == "timestamptz":
        return value if value not in ("", None) else None
    if value is None:
        return col_spec.get("default", "")
    return str(value)


def column_to_state_string(col_spec: dict, value: Any) -> str:
    col_type = col_spec.get("type", "text")
    if col_type == "bool":
        return bool_to_state_string(bool(value))
    if col_type == "int":
        if value is None:
            return int_to_state_string(col_spec.get("default"))
        return int_to_state_string(int(value))
    if col_type == "jsonb":
        return json_to_state_string(value)
    if value is None:
        return str(col_spec.get("default", ""))
    return str(value)
