"""Unit tests for secrets catalog routing and config merge behavior."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.api.secrets_catalog import (
    is_pipeline_secret_key,
    resolve_storage,
)


def test_resolve_storage_pipeline_secret() -> None:
    assert resolve_storage("bing_webmaster_api_key") == "pipeline"
    assert is_pipeline_secret_key("bing_webmaster_api_key") is True


def test_resolve_storage_llm_api_key() -> None:
    assert resolve_storage("llm_api_key_openai") == "llm"


def test_resolve_storage_google() -> None:
    assert resolve_storage("google_client_id") == "google"


def test_put_secrets_routes_pipeline_key_to_pipeline_config() -> None:
    from website_profiling.api.routers.config import put_secrets
    from website_profiling.api.routers.config import SecretsBody

    conn = MagicMock()
    body = SecretsBody(state={"bing_webmaster_api_key": "bing-secret-key"})

    with (
        patch("website_profiling.db.config_store.read_llm_config", return_value={}),
        patch("website_profiling.api.routers.config._read_llm_config_full", return_value=[]),
        patch("website_profiling.db.config_store.read_pipeline_config", return_value=({}, [])),
        patch("website_profiling.db.config_store.write_pipeline_config") as write_pipeline,
        patch("website_profiling.api.routers.config.get_secrets", return_value={"state": {}, "source": "db"}),
    ):
        result = put_secrets(body, conn)

    write_pipeline.assert_called_once()
    args = write_pipeline.call_args[0]
    assert args[1]["bing_webmaster_api_key"] == "bing-secret-key"
    assert result["ok"] is True


def test_put_llm_config_partial_preserves_existing_keys() -> None:
    from website_profiling.api.routers.config import LlmConfigBody, put_llm_config

    conn = MagicMock()
    body = LlmConfigBody(state={"llm_enabled": "false"})

    with (
        patch(
            "website_profiling.api.routers.config._read_llm_config_full",
            return_value=[
                {"key": "llm_enabled", "value": "true", "is_secret": False},
                {"key": "llm_api_key_openai", "value": "sk-keep", "is_secret": True},
            ],
        ),
        patch("website_profiling.db.config_store.write_llm_config") as write_llm,
    ):
        put_llm_config(body, conn)

    entries = write_llm.call_args[0][1]
    assert entries["llm_enabled"] == "false"
    assert entries["llm_api_key_openai"] == "sk-keep"


def test_put_secrets_masked_sentinel_skips_update() -> None:
    from website_profiling.api.routers.config import SecretsBody, put_secrets

    conn = MagicMock()
    body = SecretsBody(state={"llm_api_key_openai": "*", "bing_webmaster_api_key": "*"})

    with (
        patch("website_profiling.db.config_store.read_llm_config", return_value={"llm_api_key_openai": "sk-old"}),
        patch(
            "website_profiling.api.routers.config._read_llm_config_full",
            return_value=[{"key": "llm_api_key_openai", "value": "sk-old", "is_secret": True}],
        ),
        patch("website_profiling.db.config_store.write_llm_config") as write_llm,
        patch("website_profiling.db.config_store.read_pipeline_config", return_value=({"bing_webmaster_api_key": "old-bing"}, [])),
        patch("website_profiling.db.config_store.write_pipeline_config") as write_pipeline,
        patch("website_profiling.api.routers.config.get_secrets", return_value={"state": {}, "source": "db"}),
    ):
        put_secrets(body, conn)

    write_pipeline.assert_not_called()
    if write_llm.called:
        entries = write_llm.call_args[0][1]
        assert entries.get("llm_api_key_openai") == "sk-old"
