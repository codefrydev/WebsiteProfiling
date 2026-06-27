"""Read/write pipeline domain typed tables."""
from __future__ import annotations

from dataclasses import fields
from typing import Any

from psycopg import Connection

from ._base import read_singleton, read_text_singleton, write_singleton, write_text_singleton
from .models import PIPELINE_DOMAIN_MODELS, WorkspaceSettings


def read_pipeline_domain(conn: Connection, table: str) -> Any:
    model_cls = PIPELINE_DOMAIN_MODELS[table]
    return read_text_singleton(conn, table, model_cls)


def write_pipeline_domain(
    conn: Connection,
    table: str,
    model: Any,
    *,
    columns: list[str] | None = None,
) -> None:
    write_text_singleton(conn, table, model, columns=columns)


def read_all_pipeline_domains(conn: Connection) -> dict[str, Any]:
    return {table: read_pipeline_domain(conn, table) for table in PIPELINE_DOMAIN_MODELS}


def read_workspace_settings(conn: Connection) -> WorkspaceSettings:
    return read_singleton(conn, "workspace_settings", WorkspaceSettings)


def write_workspace_settings(
    conn: Connection,
    settings: WorkspaceSettings,
    *,
    columns: list[str] | None = None,
) -> None:
    write_singleton(conn, "workspace_settings", settings, columns=columns)


def patch_workspace_settings(conn: Connection, updates: dict[str, str]) -> None:
    current = read_workspace_settings(conn)
    valid = {f.name for f in fields(WorkspaceSettings)}
    cols: list[str] = []
    for key, value in updates.items():
        if key in valid:
            if key == "active_property_id":
                from ._serialize import parse_int

                current.active_property_id = parse_int(value)
            else:
                setattr(current, key, str(value))
            cols.append(key)
    if cols:
        write_workspace_settings(conn, current, columns=cols)


def patch_pipeline_domain(conn: Connection, table: str, updates: dict[str, str]) -> None:
    model_cls = PIPELINE_DOMAIN_MODELS[table]
    current = read_pipeline_domain(conn, table)
    valid = {f.name for f in fields(model_cls)}
    cols: list[str] = []
    for key, value in updates.items():
        if key in valid:
            setattr(current, key, str(value))
            cols.append(key)
    if cols:
        write_pipeline_domain(conn, table, current, columns=cols)
