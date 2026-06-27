"""Singleton typed-table read/write helpers."""
from __future__ import annotations

from dataclasses import fields
from typing import Any, TypeVar

from psycopg import Connection
from psycopg.types.json import Json

from .._common import _row_field
from ._manifest import load_manifest
from ._serialize import column_from_row, parse_column_value, serialize_column_value
from .models import SINGLETON_ID

T = TypeVar("T")


def _table_columns(table: str) -> dict[str, dict]:
    return load_manifest()["tables"][table]["columns"]


def read_singleton(conn: Connection, table: str, model_cls: type[T]) -> T:
    col_names = [f.name for f in fields(model_cls)]
    col_specs = _table_columns(table)
    quoted = ", ".join(col_names)
    cur = conn.execute(f"SELECT {quoted} FROM {table} WHERE id = %s", (SINGLETON_ID,))
    row = cur.fetchone()
    if not row:
        return model_cls()
    values: dict[str, Any] = {}
    for idx, name in enumerate(col_names):
        raw = column_from_row(row, name, index=idx)
        values[name] = parse_column_value(col_specs[name], raw)
    return model_cls(**values)


def write_singleton(conn: Connection, table: str, model: Any, *, columns: list[str] | None = None) -> None:
    col_specs = _table_columns(table)
    col_names = columns or [f.name for f in fields(model)]
    if not col_names:
        return
    sets: list[str] = []
    vals: list[Any] = []
    for name in col_names:
        sets.append(f"{name} = %s")
        raw = getattr(model, name)
        val = serialize_column_value(col_specs[name], raw)
        if col_specs[name].get("type") == "jsonb" and val is not None and not isinstance(val, str):
            val = Json(val)
        vals.append(val)
    sets.append("updated_at = now()")
    sql = f"UPDATE {table} SET {', '.join(sets)} WHERE id = %s"
    vals.append(SINGLETON_ID)
    conn.execute(sql, vals)


def read_text_singleton(conn: Connection, table: str, model_cls: type[T]) -> T:
    """Read pipeline domain singleton where every column is TEXT."""
    col_names = [f.name for f in fields(model_cls)]
    quoted = ", ".join(col_names)
    cur = conn.execute(f"SELECT {quoted} FROM {table} WHERE id = %s", (SINGLETON_ID,))
    row = cur.fetchone()
    if not row:
        return model_cls()
    values: dict[str, str] = {}
    for idx, name in enumerate(col_names):
        raw = column_from_row(row, name, index=idx)
        values[name] = "" if raw is None else str(raw)
    return model_cls(**values)


def write_text_singleton(
    conn: Connection,
    table: str,
    model: Any,
    *,
    columns: list[str] | None = None,
) -> None:
    col_names = columns or [f.name for f in fields(model)]
    if not col_names:
        return
    sets = [f"{name} = %s" for name in col_names]
    vals = [str(getattr(model, name) or "") for name in col_names]
    sets.append("updated_at = now()")
    sql = f"UPDATE {table} SET {', '.join(sets)} WHERE id = %s"
    vals.append(SINGLETON_ID)
    conn.execute(sql, vals)
