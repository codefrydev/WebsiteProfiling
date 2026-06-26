"""Read/write client_preferences typed table."""
from __future__ import annotations

from dataclasses import fields
from typing import Any

from psycopg import Connection

from ._base import read_singleton, write_singleton
from ._serialize import legacy_to_bool
from .models import ClientPreferences


def read_client_preferences(conn: Connection) -> ClientPreferences:
    return read_singleton(conn, "client_preferences", ClientPreferences)


def write_client_preferences(
    conn: Connection,
    settings: ClientPreferences,
    *,
    columns: list[str] | None = None,
) -> None:
    write_singleton(conn, "client_preferences", settings, columns=columns)


def _coerce_field(name: str, value: Any) -> Any:
    if name in ("sidebar_collapsed", "content_studio_ai_enabled", "animations_enabled"):
        if isinstance(value, bool):
            return value
        return legacy_to_bool(str(value))
    return str(value) if value is not None else ""


def patch_client_preferences(conn: Connection, updates: dict[str, Any]) -> None:
    current = read_client_preferences(conn)
    valid = {f.name for f in fields(ClientPreferences)}
    cols: list[str] = []
    for key, value in updates.items():
        if key in valid:
            setattr(current, key, _coerce_field(key, value))
            cols.append(key)
    if cols:
        write_client_preferences(conn, current, columns=cols)
