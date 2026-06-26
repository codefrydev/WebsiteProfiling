"""Read/write ui_preferences typed table."""
from __future__ import annotations

from dataclasses import fields

from psycopg import Connection

from ._base import read_singleton, write_singleton
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
    col_map = {
        "brand_name": "brand_name",
        "brand_subtitle": "brand_subtitle",
        "brand_logo_url": "brand_logo_url",
        "custom_theme": "custom_theme_json",
        "ui_prefs": "ui_prefs_json",
    }
    cols: list[str] = []
    for legacy_key, value in updates.items():
        column = col_map.get(legacy_key, legacy_key)
        if column in {f.name for f in fields(UiPreferences)}:
            if column.endswith("_json"):
                from ._serialize import legacy_to_json

                setattr(current, column, legacy_to_json(value))
            else:
                setattr(current, column, str(value))
            cols.append(column)
    if cols:
        write_ui_preferences(conn, current, columns=cols)
