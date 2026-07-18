"""Pipeline and LLM config tables."""
from __future__ import annotations

import logging
from typing import Any

from psycopg import Connection

from ._common import _row_field
from .typed_config.worker_config import (
    load_worker_llm_config,
    load_worker_pipeline_config,
    save_worker_llm_config,
    save_worker_pipeline_config,
)

logger = logging.getLogger(__name__)


def read_pipeline_config(conn: Connection) -> tuple[dict[str, str], list[dict[str, str]]]:
    try:
        return load_worker_pipeline_config(conn), []
    except Exception:
        logger.warning("read_pipeline_config failed", exc_info=True)
        return {}, []


def write_pipeline_config(conn: Connection, entries: dict[str, str]) -> None:
    save_worker_pipeline_config(conn, entries)


def read_llm_config(conn: Connection) -> dict[str, str]:
    try:
        return load_worker_llm_config(conn)
    except Exception:
        logger.warning("read_llm_config failed", exc_info=True)
        return {}


def write_llm_config(conn: Connection, entries: dict[str, str], secret_keys: set[str] | None = None) -> None:
    del secret_keys
    save_worker_llm_config(conn, entries)


def read_llm_config_full(conn: Connection) -> list[dict[str, Any]]:
    """Return llm config rows including the is_secret flag."""
    try:
        flat = load_worker_llm_config(conn)
        secret_suffixes = ("_api_key", "_key", "_token", "_password", "_secret")
        rows: list[dict[str, Any]] = []
        for key in sorted(flat):
            val = flat[key]
            key_lower = key.lower()
            is_secret = (
                key_lower.endswith(secret_suffixes)
                or "api_key" in key_lower
                or "secret" in key_lower
                or "password" in key_lower
                or "token" in key_lower
            )
            rows.append({"key": key, "value": val, "is_secret": is_secret})
        return rows
    except Exception:
        logger.warning("read_llm_config_full failed", exc_info=True)
        return []


def read_app_setting(conn: Connection, key: str) -> str | None:
    try:
        from .typed_config.ui_preferences_store import read_ui_preferences

        prefs = read_ui_preferences(conn)
        col_map = {
            "brand_name": prefs.brand_name,
            "brand_subtitle": prefs.brand_subtitle,
            "brand_logo_url": prefs.brand_logo_url,
            "custom_theme": prefs.custom_theme_json,
            "ui_prefs": prefs.ui_prefs_json,
        }
        val = col_map.get(key.strip())
        if val is None:
            return None
        if isinstance(val, (dict, list)):
            import json

            return json.dumps(val)
        text = str(val).strip()
        return text or None
    except Exception:
        logger.warning("read_app_setting failed for key=%s", key, exc_info=True)
        return None


def write_app_setting(conn: Connection, key: str, value: str) -> None:
    from .typed_config.ui_preferences_store import patch_ui_preferences

    patch_ui_preferences(conn, {key.strip(): value})
    conn.commit()
