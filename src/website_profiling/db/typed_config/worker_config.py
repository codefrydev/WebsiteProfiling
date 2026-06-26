"""Load and save typed pipeline configuration for worker runtime."""
from __future__ import annotations

from dataclasses import fields
from datetime import datetime, timezone

from psycopg import Connection

from ._manifest import (
    llm_legacy_key_to_column,
    llm_providers,
    load_manifest,
    pipeline_domain_tables,
    provider_legacy_key,
)
from ._serialize import column_to_legacy, legacy_to_bool
from .llm_settings_store import (
    read_llm_provider_profiles,
    read_llm_settings,
    write_llm_provider_profile,
    write_llm_settings,
)
from .models import LlmProviderProfile
from .pipeline_settings_store import (
    patch_pipeline_domain,
    patch_workspace_settings,
    read_all_pipeline_domains,
    read_workspace_settings,
)
from .secrets_store import (
    patch_feature_flags,
    patch_integration_secrets,
    patch_mcp_settings,
    read_feature_flags,
    read_integration_secrets,
    read_mcp_settings,
)


def _singleton_table_legacy_keys(table: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for column, col_spec in load_manifest()["tables"][table]["columns"].items():
        lk = col_spec.get("legacy_key")
        if lk:
            out[column] = lk
    return out


def load_worker_pipeline_config(conn: Connection) -> dict[str, str]:
    """Flat key dict for worker/crawl code paths (internal only, not HTTP)."""
    out: dict[str, str] = {}

    for table, model in read_all_pipeline_domains(conn).items():
        for key in pipeline_domain_tables()[table]:
            out[key] = str(getattr(model, key, "") or "")

    workspace = read_workspace_settings(conn)
    ws_cols = _singleton_table_legacy_keys("workspace_settings")
    ws_specs = load_manifest()["tables"]["workspace_settings"]["columns"]
    for column, legacy_key in ws_cols.items():
        value = getattr(workspace, column)
        out[legacy_key] = column_to_legacy(ws_specs[column], value)

    for table, reader in (
        ("integration_secrets", read_integration_secrets),
        ("mcp_settings", read_mcp_settings),
        ("feature_flags", read_feature_flags),
    ):
        model = reader(conn)
        col_specs = load_manifest()["tables"][table]["columns"]
        for column, legacy_key in _singleton_table_legacy_keys(table).items():
            out[legacy_key] = column_to_legacy(col_specs[column], getattr(model, column))

    return out


def save_worker_pipeline_config(conn: Connection, entries: dict[str, str]) -> None:
    if not entries:
        return

    routing = {}
    for table, keys in pipeline_domain_tables().items():
        for key in keys:
            routing[key] = ("domain", table, key)

    for table in ("integration_secrets", "mcp_settings", "feature_flags", "workspace_settings"):
        for column, legacy_key in _singleton_table_legacy_keys(table).items():
            routing[legacy_key] = ("singleton", table, column)

    domain_updates: dict[str, dict[str, str]] = {}
    singleton_updates: dict[str, dict[str, str]] = {}

    for legacy_key, value in entries.items():
        route = routing.get(legacy_key)
        if not route:
            continue
        kind, table, column = route
        if kind == "domain":
            domain_updates.setdefault(table, {})[column] = str(value)
        else:
            singleton_updates.setdefault(table, {})[column] = str(value)

    with conn.transaction():
        for table, updates in domain_updates.items():
            patch_pipeline_domain(conn, table, updates)
        for table, updates in singleton_updates.items():
            if table == "integration_secrets":
                patch_integration_secrets(conn, updates)
            elif table == "mcp_settings":
                patch_mcp_settings(conn, updates)
            elif table == "feature_flags":
                patch_feature_flags(conn, updates)
            elif table == "workspace_settings":
                patch_workspace_settings(conn, updates)


def load_worker_llm_config(conn: Connection) -> dict[str, str]:
    """Flat key dict for Python LLM callers (internal only, not HTTP)."""
    out: dict[str, str] = {}
    settings = read_llm_settings(conn)
    col_specs = load_manifest()["tables"]["llm_settings"]["columns"]
    for column, col_spec in col_specs.items():
        legacy_key = col_spec.get("legacy_key")
        if legacy_key:
            out[legacy_key] = column_to_legacy(col_spec, getattr(settings, column))

    profiles = read_llm_provider_profiles(conn)
    for provider in llm_providers():
        profile = profiles.get(provider, LlmProviderProfile(provider=provider))
        out[provider_legacy_key("api_key", provider)] = profile.api_key
        out[provider_legacy_key("saved_model", provider)] = profile.saved_model

    provider = (out.get("llm_provider") or "none").strip().lower()
    if provider and provider != "none":
        per_provider_key = provider_legacy_key("api_key", provider)
        resolved = (out.get(per_provider_key) or "").strip()
        if resolved:
            out["llm_api_key"] = resolved

    return out


def save_worker_llm_config(conn: Connection, entries: dict[str, str]) -> None:
    if not entries:
        return

    legacy_to_col = llm_legacy_key_to_column()
    col_specs = load_manifest()["tables"]["llm_settings"]["columns"]
    settings = read_llm_settings(conn)
    settings_cols: list[str] = []

    profiles = read_llm_provider_profiles(conn)
    touched_profiles: dict[str, LlmProviderProfile] = {}

    for legacy_key, raw_value in entries.items():
        value = str(raw_value)
        column = legacy_to_col.get(legacy_key)
        if column:
            col_spec = col_specs[column]
            col_type = col_spec.get("type", "text")
            if col_type == "bool":
                setattr(
                    settings,
                    column,
                    legacy_to_bool(value, default=bool(col_spec.get("default", False))),
                )
            elif col_type == "int":
                from ._serialize import legacy_to_int

                parsed = legacy_to_int(value, default=col_spec.get("default"))
                setattr(settings, column, parsed if parsed is not None else col_spec.get("default"))
            else:
                setattr(settings, column, value)
            settings_cols.append(column)
            continue

        matched_provider = False
        for provider in llm_providers():
            if legacy_key == provider_legacy_key("api_key", provider):
                profile = profiles.get(provider, LlmProviderProfile(provider=provider))
                profile.api_key = value
                if value.strip():
                    profile.api_key_updated_at = datetime.now(timezone.utc)
                touched_profiles[provider] = profile
                matched_provider = True
                break
            if legacy_key == provider_legacy_key("saved_model", provider):
                profile = profiles.get(provider, LlmProviderProfile(provider=provider))
                profile.saved_model = value
                touched_profiles[provider] = profile
                matched_provider = True
                break
        if matched_provider:
            continue

        if legacy_key == "llm_api_key":
            provider = (entries.get("llm_provider") or settings.provider or "none").strip().lower()
            if provider and provider != "none":
                profile = profiles.get(provider, LlmProviderProfile(provider=provider))
                profile.api_key = value
                if value.strip():
                    profile.api_key_updated_at = datetime.now(timezone.utc)
                touched_profiles[provider] = profile

    with conn.transaction():
        if settings_cols:
            write_llm_settings(conn, settings, columns=settings_cols)
        for profile in touched_profiles.values():
            write_llm_provider_profile(conn, profile)
