"""Read/write integration_secrets, mcp_settings, and feature_flags."""
from __future__ import annotations

from dataclasses import fields

from psycopg import Connection

from ._base import read_singleton, write_singleton
from .models import FeatureFlags, IntegrationSecrets, McpSettings


def read_integration_secrets(conn: Connection) -> IntegrationSecrets:
    return read_singleton(conn, "integration_secrets", IntegrationSecrets)


def write_integration_secrets(
    conn: Connection,
    settings: IntegrationSecrets,
    *,
    columns: list[str] | None = None,
) -> None:
    write_singleton(conn, "integration_secrets", settings, columns=columns)


def read_mcp_settings(conn: Connection) -> McpSettings:
    return read_singleton(conn, "mcp_settings", McpSettings)


def write_mcp_settings(
    conn: Connection,
    settings: McpSettings,
    *,
    columns: list[str] | None = None,
) -> None:
    write_singleton(conn, "mcp_settings", settings, columns=columns)


def read_feature_flags(conn: Connection) -> FeatureFlags:
    return read_singleton(conn, "feature_flags", FeatureFlags)


def write_feature_flags(
    conn: Connection,
    settings: FeatureFlags,
    *,
    columns: list[str] | None = None,
) -> None:
    write_singleton(conn, "feature_flags", settings, columns=columns)


def patch_integration_secrets(conn: Connection, updates: dict[str, str]) -> None:
    current = read_integration_secrets(conn)
    valid = {f.name for f in fields(IntegrationSecrets)}
    cols = []
    for key, value in updates.items():
        if key in valid:
            setattr(current, key, str(value))
            cols.append(key)
    if cols:
        write_integration_secrets(conn, current, columns=cols)


def patch_mcp_settings(conn: Connection, updates: dict[str, str]) -> None:
    current = read_mcp_settings(conn)
    valid = {f.name for f in fields(McpSettings)}
    cols = []
    for key, value in updates.items():
        if key in valid:
            setattr(current, key, str(value))
            cols.append(key)
    if cols:
        write_mcp_settings(conn, current, columns=cols)


def patch_feature_flags(conn: Connection, updates: dict[str, str]) -> None:
    current = read_feature_flags(conn)
    valid = {f.name for f in fields(FeatureFlags)}
    cols = []
    for key, value in updates.items():
        if key in valid:
            setattr(current, key, value)
            cols.append(key)
    if cols:
        write_feature_flags(conn, current, columns=cols)
