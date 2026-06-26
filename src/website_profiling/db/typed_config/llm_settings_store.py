"""Read/write llm_settings and llm_provider_profiles."""
from __future__ import annotations

from datetime import datetime, timezone

from psycopg import Connection

from ._base import read_singleton, write_singleton
from ._manifest import llm_providers
from ._serialize import column_from_row
from .models import LlmProviderProfile, LlmSettings


def read_llm_settings(conn: Connection) -> LlmSettings:
    return read_singleton(conn, "llm_settings", LlmSettings)


def write_llm_settings(conn: Connection, settings: LlmSettings, *, columns: list[str] | None = None) -> None:
    write_singleton(conn, "llm_settings", settings, columns=columns)


def read_llm_provider_profiles(conn: Connection) -> dict[str, LlmProviderProfile]:
    cur = conn.execute(
        "SELECT provider, api_key, saved_model, api_key_updated_at FROM llm_provider_profiles ORDER BY provider"
    )
    out: dict[str, LlmProviderProfile] = {}
    for row in cur.fetchall() or []:
        provider = str(column_from_row(row, "provider", index=0) or "")
        if not provider:
            continue
        out[provider] = LlmProviderProfile(
            provider=provider,
            api_key=str(column_from_row(row, "api_key", index=1) or ""),
            saved_model=str(column_from_row(row, "saved_model", index=2) or ""),
            api_key_updated_at=column_from_row(row, "api_key_updated_at", index=3),
        )
    return out


def write_llm_provider_profile(conn: Connection, profile: LlmProviderProfile) -> None:
    conn.execute(
        """
        INSERT INTO llm_provider_profiles (provider, api_key, saved_model, api_key_updated_at)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (provider) DO UPDATE SET
            api_key = EXCLUDED.api_key,
            saved_model = EXCLUDED.saved_model,
            api_key_updated_at = EXCLUDED.api_key_updated_at
        """,
        (
            profile.provider,
            profile.api_key,
            profile.saved_model,
            profile.api_key_updated_at,
        ),
    )


def write_llm_provider_profiles(conn: Connection, profiles: dict[str, LlmProviderProfile]) -> None:
    for profile in profiles.values():
        write_llm_provider_profile(conn, profile)


def ensure_llm_provider_profiles(conn: Connection) -> None:
    existing = read_llm_provider_profiles(conn)
    for provider in llm_providers():
        if provider not in existing:
            write_llm_provider_profile(conn, LlmProviderProfile(provider=provider))


def touch_provider_api_key(conn: Connection, provider: str, api_key: str) -> None:
    profiles = read_llm_provider_profiles(conn)
    current = profiles.get(provider, LlmProviderProfile(provider=provider))
    current.api_key = api_key
    current.api_key_updated_at = datetime.now(timezone.utc)
    write_llm_provider_profile(conn, current)
