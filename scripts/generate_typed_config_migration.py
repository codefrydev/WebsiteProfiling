#!/usr/bin/env python3
"""Generate SQL fragments for typed config migration from config/typed_config_manifest.json."""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((REPO / "config" / "typed_config_manifest.json").read_text())


def pg_type(spec: dict) -> str:
    t = spec.get("type", "text")
    if t == "bool":
        return "BOOLEAN NOT NULL"
    if t == "int":
        return "INTEGER NOT NULL"
    if t == "float":
        return "DOUBLE PRECISION NOT NULL"
    if t == "jsonb":
        return "JSONB"
    if spec.get("nullable"):
        return "TEXT"
    return "TEXT NOT NULL"


def default_clause(spec: dict) -> str:
    if "default" not in spec and spec.get("type") != "bool":
        if spec.get("nullable"):
            return ""
        return " DEFAULT ''"
    val = spec.get("default")
    t = spec.get("type", "text")
    if t == "bool":
        return f" DEFAULT {'true' if val else 'false'}"
    if t == "int":
        return f" DEFAULT {int(val)}"
    if t == "float":
        return f" DEFAULT {float(val)}"
    if val is None:
        return ""
    escaped = str(val).replace("'", "''")
    return f" DEFAULT '{escaped}'"


def create_singleton_table(name: str, spec: dict) -> str:
    cols = ["id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)"]
    for col, col_spec in spec["columns"].items():
        nullable = " NULL" if col_spec.get("nullable") else ""
        if col_spec.get("nullable") and col_spec.get("type") == "int":
            cols.append(f"{col} INTEGER{nullable}")
        elif col_spec.get("type") == "jsonb":
            cols.append(f"{col} JSONB{nullable}")
        else:
            cols.append(f"{col} {pg_type(col_spec).replace(' NOT NULL', '')}{nullable}")
            if not nullable.strip():
                cols[-1] = f"{col} {pg_type(col_spec)}{default_clause(col_spec)}"
    cols.append("updated_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    ddl = f"CREATE TABLE {name} (\n    " + ",\n    ".join(cols) + "\n);"
    insert = f"INSERT INTO {name} (id) VALUES (1) ON CONFLICT (id) DO NOTHING;"
    return ddl + "\n" + insert


def backfill_singleton(name: str, spec: dict, source: str) -> str:
    sets = []
    for col, col_spec in spec["columns"].items():
        legacy = col_spec.get("legacy_key") or col_spec.get("legacy_app_key")
        if not legacy:
            continue
        sets.append(
            f"{col} = COALESCE((SELECT value FROM {source} WHERE key = '{legacy}'), {col}::text)"
        )
    if not sets:
        return ""
    return f"UPDATE {name} SET {', '.join(sets)} WHERE id = 1;"


def create_pipeline_table(name: str, keys: list[str]) -> str:
    cols = ["id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1)"]
    for key in keys:
        cols.append(f"{key} TEXT NOT NULL DEFAULT ''")
    cols.append("updated_at TIMESTAMPTZ NOT NULL DEFAULT now()")
    ddl = f"CREATE TABLE {name} (\n    " + ",\n    ".join(cols) + "\n);"
    insert = f"INSERT INTO {name} (id) VALUES (1) ON CONFLICT (id) DO NOTHING;"
    return ddl + "\n" + insert


def backfill_pipeline_table(name: str, keys: list[str]) -> str:
    sets = [
        f"{key} = COALESCE((SELECT value FROM pipeline_config WHERE key = '{key}' AND is_unknown = false), {key})"
        for key in keys
    ]
    return f"UPDATE {name} SET {', '.join(sets)} WHERE id = 1;"


if __name__ == "__main__":
    parts = []
    for table, spec in MANIFEST["tables"].items():
        if table == "llm_provider_profiles":
            parts.append(
                """CREATE TABLE llm_provider_profiles (
    provider TEXT PRIMARY KEY,
    api_key TEXT NOT NULL DEFAULT '',
    saved_model TEXT NOT NULL DEFAULT '',
    api_key_updated_at TIMESTAMPTZ
);"""
            )
            continue
        if spec.get("singleton"):
            parts.append(create_singleton_table(table, spec))
    for table, keys in MANIFEST["pipeline_domain_tables"].items():
        parts.append(create_pipeline_table(table, keys))
    print("\n\n".join(parts))
