"""Read/write ui_preferences typed table."""
from __future__ import annotations

from dataclasses import fields

from psycopg import Connection

from ._base import read_singleton, write_singleton
from ._manifest import load_manifest
from .models import UiPreferences


def read_ui_preferences(conn: Connection) -> UiPreferences:
    return read_singleton(conn, "ui_preferences", UiPreferences)


def write_ui_preferences(
    conn: Connection,
    settings: UiPreferences,
    *,
    columns: list[str] | None = None,
) -> None:
    write_singleton(conn, "ui_preferences", settings, columns=columns)


def patch_ui_preferences(conn: Connection, updates: dict[str, str]) -> None:
    current = read_ui_preferences(conn)
    col_specs = load_manifest()["tables"]["ui_preferences"]["columns"]
    app_key_to_column = {
        col_spec["app_key"]: column
        for column, col_spec in col_specs.items()
        if col_spec.get("app_key")
    }
    cols: list[str] = []
    for app_key, value in updates.items():
        column = app_key_to_column.get(app_key, app_key)
        if column in {f.name for f in fields(UiPreferences)}:
            if column.endswith("_json"):
                from ._serialize import parse_json

                setattr(current, column, parse_json(value))
            else:
                setattr(current, column, str(value))
            cols.append(column)
    if cols:
        write_ui_preferences(conn, current, columns=cols)
