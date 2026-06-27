"""Unit tests for typed_config stores, serialization, and worker config."""
from __future__ import annotations

from dataclasses import fields
from datetime import datetime, timezone
from typing import Any

import pytest
from psycopg.types.json import Json

from tests.db_test_fakes import FakeConn, FakeCursor


def _row_for(model_cls: type[Any], **overrides: Any) -> tuple[Any, ...]:
    defaults = model_cls()
    return tuple(overrides.get(f.name, getattr(defaults, f.name)) for f in fields(model_cls))


def _queue_read(conn: FakeConn, model_cls: type[Any], **overrides: Any) -> None:
    conn.set_next_cursor(FakeCursor(fetchone_value=_row_for(model_cls, **overrides)))


def test_serialize_helpers() -> None:
    from website_profiling.db.typed_config import _serialize as ser

    assert ser.bool_to_state_string(True) == "true"
    assert ser.parse_bool("yes") is True
    assert ser.parse_bool(None, default=True) is True
    assert ser.parse_bool("bogus", default=False) is False

    assert ser.int_to_state_string(None) == ""
    assert ser.int_to_state_string(42) == "42"
    assert ser.parse_int("7") == 7
    assert ser.parse_int("x", default=3) == 3

    assert ser.json_to_state_string(None) == ""
    assert ser.json_to_state_string('{"a":1}') == '{"a":1}'
    assert ser.json_to_state_string({"a": 1}) == '{"a":1}'

    assert ser.parse_json(None) is None
    assert ser.parse_json({"k": "v"}) == {"k": "v"}
    assert ser.parse_json("{bad") == "{bad"
    assert ser.parse_json('{"ok":true}') == {"ok": True}

    assert ser.column_from_row(None, "x") is None
    assert ser.column_from_row({"a": 1}, "a") == 1
    assert ser.column_from_row(("a", "b"), "b", index=1) == "b"
    assert ser.column_from_row(("a",), "missing", index=9) is None
    assert ser.column_from_row(("a",), "col_without_index") is None

    class _BadRow:
        def __getitem__(self, _i: int) -> None:
            raise TypeError("bad index")

    assert ser.column_from_row(_BadRow(), "x", index=0) is None

    bool_spec = {"type": "bool", "default": False}
    assert ser.parse_column_value(bool_spec, None) is False
    assert ser.parse_column_value(bool_spec, True) is True
    assert ser.parse_column_value(bool_spec, "yes") is True

    int_spec = {"type": "int", "default": 5}
    assert ser.parse_column_value(int_spec, None) == 5
    assert ser.parse_column_value(int_spec, 9) == 9
    assert ser.parse_column_value(int_spec, "11") == 11

    json_spec = {"type": "jsonb", "default": None}
    assert ser.parse_column_value(json_spec, {"x": 1}) == {"x": 1}
    assert ser.parse_column_value(json_spec, '{"y":2}') == {"y": 2}

    ts_spec = {"type": "timestamptz"}
    now = datetime.now(timezone.utc)
    assert ser.parse_column_value(ts_spec, now) is now
    assert ser.parse_column_value(ts_spec, "") is None
    assert ser.parse_column_value(ts_spec, "2024-01-01") == "2024-01-01"

    text_spec = {"type": "text", "default": "fallback"}
    assert ser.parse_column_value(text_spec, None) == "fallback"
    assert ser.parse_column_value(text_spec, "hello") == "hello"

    assert ser.serialize_column_value(bool_spec, "true") is True
    assert ser.serialize_column_value(int_spec, "") == 5
    assert ser.serialize_column_value(int_spec, "8") == 8
    assert ser.serialize_column_value(int_spec, 12) == 12
    assert ser.serialize_column_value(json_spec, '{"z":3}') == {"z": 3}
    assert ser.serialize_column_value(json_spec, {"z": 3}) == {"z": 3}
    assert ser.serialize_column_value(ts_spec, "") is None
    assert ser.serialize_column_value(text_spec, None) == "fallback"

    assert ser.column_to_state_string(bool_spec, True) == "true"
    assert ser.column_to_state_string(int_spec, None) == "5"
    assert ser.column_to_state_string(int_spec, 10) == "10"
    assert ser.column_to_state_string(json_spec, {"a": 1}) == '{"a":1}'
    assert ser.column_to_state_string(text_spec, None) == "fallback"


def test_manifest_helpers() -> None:
    from website_profiling.db.typed_config import _manifest as manifest

    data = manifest.load_manifest()
    assert data["version"] == 1
    assert manifest.llm_providers()[0] == "openai"
    assert "llm_settings" in manifest.singleton_tables()
    assert "crawl_settings" in manifest.pipeline_domain_tables()
    assert manifest.flat_key_for_column("llm_settings", "provider") == "llm_provider"
    assert manifest.column_for_flat_key("llm_settings", "llm_provider") == "provider"
    assert manifest.column_for_flat_key("llm_settings", "missing_key") is None
    assert manifest.pipeline_state_key_to_column()["start_url"] == ("crawl_settings", "start_url")
    assert manifest.llm_state_key_to_column()["llm_provider"] == "provider"
    assert manifest.provider_state_key("api_key", "openai") == "llm_api_key_openai"


def test_models_dataclass_columns() -> None:
    from website_profiling.db.typed_config.models import LlmSettings, dataclass_columns

    assert "provider" in dataclass_columns(LlmSettings)


def test_base_singleton_read_write() -> None:
    from website_profiling.db.typed_config._base import (
        read_singleton,
        read_text_singleton,
        write_singleton,
        write_text_singleton,
    )
    from website_profiling.db.typed_config.models import CrawlSettings, FeatureFlags, UiPreferences

    conn = FakeConn()
    _queue_read(conn, FeatureFlags, pipeline_enabled=False)
    flags = read_singleton(conn, "feature_flags", FeatureFlags)
    assert flags.pipeline_enabled is False

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value=None))
    assert read_singleton(conn2, "feature_flags", FeatureFlags).pipeline_enabled is True

    conn3 = FakeConn()
    _queue_read(conn3, UiPreferences, brand_name="Acme", custom_theme_json={"c": 1})
    prefs = read_singleton(conn3, "ui_preferences", UiPreferences)
    assert prefs.brand_name == "Acme"
    assert prefs.custom_theme_json == {"c": 1}

    conn4 = FakeConn()
    write_singleton(conn4, "feature_flags", FeatureFlags(), columns=["pipeline_enabled"])
    assert conn4.executed

    from unittest.mock import patch

    conn4b = FakeConn()
    with patch("website_profiling.db.typed_config._base.fields", return_value=[]):
        write_singleton(conn4b, "feature_flags", FeatureFlags(), columns=None)
    assert conn4b.executed == []

    conn5 = FakeConn()
    write_singleton(conn5, "ui_preferences", UiPreferences(custom_theme_json={"x": 1}), columns=["custom_theme_json"])
    assert conn5.executed
    _, params = conn5.executed[0]
    assert isinstance(params[0], Json)

    conn6 = FakeConn()
    conn6.set_next_cursor(FakeCursor(fetchone_value=None))
    assert read_text_singleton(conn6, "crawl_settings", CrawlSettings).start_url == ""

    conn7 = FakeConn()
    write_text_singleton(conn7, "crawl_settings", CrawlSettings(start_url="https://ex.com"), columns=["start_url"])
    assert "crawl_settings" in conn7.executed[0][0]

    conn8 = FakeConn()
    with patch("website_profiling.db.typed_config._base.fields", return_value=[]):
        write_text_singleton(conn8, "crawl_settings", CrawlSettings(), columns=None)
    assert conn8.executed == []


def test_llm_settings_store() -> None:
    from website_profiling.db.typed_config.llm_settings_store import (
        ensure_llm_provider_profiles,
        read_llm_provider_profiles,
        read_llm_settings,
        touch_provider_api_key,
        write_llm_provider_profile,
        write_llm_provider_profiles,
        write_llm_settings,
    )
    from website_profiling.db.typed_config.models import LlmProviderProfile, LlmSettings

    conn = FakeConn()
    _queue_read(conn, LlmSettings, provider="openai", enabled=True)
    settings = read_llm_settings(conn)
    assert settings.provider == "openai"

    conn2 = FakeConn()
    write_llm_settings(conn2, LlmSettings(provider="gemini"), columns=["provider"])
    assert "llm_settings" in conn2.executed[0][0]

    conn3 = FakeConn()
    conn3.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                ("openai", "sk-test", "gpt-4", None),
                ("", "skip", "", None),
            ]
        )
    )
    profiles = read_llm_provider_profiles(conn3)
    assert profiles["openai"].api_key == "sk-test"
    assert "" not in profiles

    conn4 = FakeConn()
    profile = LlmProviderProfile(provider="groq", api_key="k", saved_model="m")
    write_llm_provider_profile(conn4, profile)
    assert "llm_provider_profiles" in conn4.executed[0][0]

    conn5 = FakeConn()
    write_llm_provider_profiles(conn5, {"ollama": LlmProviderProfile(provider="ollama")})
    assert conn5.executed

    conn6 = FakeConn()
    conn6.set_next_cursor(FakeCursor(fetchall_value=[]))
    ensure_llm_provider_profiles(conn6)
    assert len(conn6.executed) == 1 + len(
        __import__(
            "website_profiling.db.typed_config._manifest",
            fromlist=["llm_providers"],
        ).llm_providers()
    )

    conn7 = FakeConn()
    conn7.set_next_cursor(FakeCursor(fetchall_value=[("openai", "old", "", None)]))
    touch_provider_api_key(conn7, "openai", "new-key")
    assert conn7.executed[-1][1][1] == "new-key"

    conn8 = FakeConn()
    conn8.set_next_cursor(FakeCursor(fetchall_value=[]))
    touch_provider_api_key(conn8, "anthropic", "brand-new")
    assert conn8.executed[-1][1][1] == "brand-new"


def test_pipeline_and_secrets_stores() -> None:
    from website_profiling.db.typed_config.models import (
        CrawlSettings,
        FeatureFlags,
        IntegrationSecrets,
        McpSettings,
        WorkspaceSettings,
    )
    from website_profiling.db.typed_config.pipeline_settings_store import (
        patch_pipeline_domain,
        patch_workspace_settings,
        read_all_pipeline_domains,
        read_pipeline_domain,
        read_workspace_settings,
        write_pipeline_domain,
        write_workspace_settings,
    )
    from website_profiling.db.typed_config.secrets_store import (
        patch_feature_flags,
        patch_integration_secrets,
        patch_mcp_settings,
        read_feature_flags,
        read_integration_secrets,
        read_mcp_settings,
        write_feature_flags,
        write_integration_secrets,
        write_mcp_settings,
    )

    conn = FakeConn()
    _queue_read(conn, CrawlSettings, start_url="https://ex.com")
    assert read_pipeline_domain(conn, "crawl_settings").start_url == "https://ex.com"

    conn2 = FakeConn()
    for table in (
        CrawlSettings,
        __import__("website_profiling.db.typed_config.models", fromlist=["ReportSettings"]).ReportSettings,
        __import__("website_profiling.db.typed_config.models", fromlist=["LighthouseSettings"]).LighthouseSettings,
        __import__(
            "website_profiling.db.typed_config.models", fromlist=["ContentAnalysisSettings"]
        ).ContentAnalysisSettings,
        __import__("website_profiling.db.typed_config.models", fromlist=["AuditStepSettings"]).AuditStepSettings,
        __import__(
            "website_profiling.db.typed_config.models", fromlist=["GooglePipelineSettings"]
        ).GooglePipelineSettings,
        __import__("website_profiling.db.typed_config.models", fromlist=["KeywordSettings"]).KeywordSettings,
    ):
        conn2.set_next_cursor(FakeCursor(fetchone_value=_row_for(table)))
    domains = read_all_pipeline_domains(conn2)
    assert "crawl_settings" in domains

    conn3 = FakeConn()
    _queue_read(conn3, WorkspaceSettings, active_property_id=7)
    assert read_workspace_settings(conn3).active_property_id == 7

    conn4 = FakeConn()
    _queue_read(conn4, WorkspaceSettings)
    patch_workspace_settings(conn4, {"active_property_id": "9", "warning_mapper_input": "x"})
    assert conn4.executed

    conn5 = FakeConn()
    _queue_read(conn5, CrawlSettings)
    patch_pipeline_domain(conn5, "crawl_settings", {"start_url": "https://new.com", "bogus": "skip"})
    assert conn5.executed

    conn6 = FakeConn()
    write_pipeline_domain(conn6, "crawl_settings", CrawlSettings(start_url="https://w.com"), columns=["start_url"])
    assert conn6.executed

    conn7 = FakeConn()
    write_workspace_settings(conn7, WorkspaceSettings(active_property_id=1), columns=["active_property_id"])
    assert conn7.executed

    conn8 = FakeConn()
    _queue_read(conn8, IntegrationSecrets)
    patch_integration_secrets(conn8, {"bing_webmaster_api_key": "bing-key"})
    assert read_integration_secrets(FakeConn()).bing_webmaster_api_key == ""

    conn9 = FakeConn()
    _queue_read(conn9, McpSettings)
    patch_mcp_settings(conn9, {"tool_bundle": "full"})
    write_mcp_settings(conn9, McpSettings(tool_bundle="core"))

    conn10 = FakeConn()
    _queue_read(conn10, FeatureFlags)
    patch_feature_flags(conn10, {"pipeline_enabled": "false"})
    write_feature_flags(conn10, FeatureFlags())
    assert read_feature_flags(FakeConn()).pipeline_enabled is True
    write_integration_secrets(conn10, IntegrationSecrets())


def test_client_preferences_store() -> None:
    from website_profiling.db.typed_config.models import ClientPreferences
    from website_profiling.db.typed_config.client_preferences_store import (
        patch_client_preferences,
        read_client_preferences,
        write_client_preferences,
    )

    conn = FakeConn()
    _queue_read(conn, ClientPreferences, default_landing_view="issues")
    assert read_client_preferences(conn).default_landing_view == "issues"

    conn2 = FakeConn()
    _queue_read(conn2, ClientPreferences)
    patch_client_preferences(conn2, {"chat_fab_corner": "top-left", "sidebar_collapsed": "true"})
    assert conn2.executed

    conn2b = FakeConn()
    _queue_read(conn2b, ClientPreferences)
    patch_client_preferences(conn2b, {"sidebar_collapsed": True})
    assert conn2b.executed

    conn3 = FakeConn()
    write_client_preferences(conn3, ClientPreferences(network_view_mode="3d"), columns=["network_view_mode"])
    assert conn3.executed


def test_ui_preferences_store() -> None:
    from website_profiling.db.typed_config.models import UiPreferences
    from website_profiling.db.typed_config.ui_preferences_store import (
        patch_ui_preferences,
        read_ui_preferences,
        write_ui_preferences,
    )

    conn = FakeConn()
    _queue_read(conn, UiPreferences, brand_name="Brand")
    assert read_ui_preferences(conn).brand_name == "Brand"

    conn2 = FakeConn()
    _queue_read(conn2, UiPreferences)
    patch_ui_preferences(conn2, {"brand_name": "New", "custom_theme": '{"a":1}', "unknown": "skip"})
    assert conn2.executed

    conn3 = FakeConn()
    write_ui_preferences(conn3, UiPreferences(brand_subtitle="Sub"), columns=["brand_subtitle"])
    assert conn3.executed


def test_worker_config_load_save() -> None:
    from website_profiling.db.typed_config.models import (
        AuditStepSettings,
        ContentAnalysisSettings,
        CrawlSettings,
        FeatureFlags,
        GooglePipelineSettings,
        IntegrationSecrets,
        KeywordSettings,
        LighthouseSettings,
        LlmProviderProfile,
        LlmSettings,
        McpSettings,
        ReportSettings,
        WorkspaceSettings,
    )
    from website_profiling.db.typed_config.worker_config import (
        load_worker_llm_config,
        load_worker_pipeline_config,
        save_worker_llm_config,
        save_worker_pipeline_config,
    )

    conn = FakeConn()
    for model in (
        CrawlSettings,
        ReportSettings,
        LighthouseSettings,
        ContentAnalysisSettings,
        AuditStepSettings,
        GooglePipelineSettings,
        KeywordSettings,
        WorkspaceSettings,
        IntegrationSecrets,
        McpSettings,
        FeatureFlags,
    ):
        _queue_read(conn, model, start_url="https://ex.com") if model is CrawlSettings else _queue_read(conn, model)
    flat = load_worker_pipeline_config(conn)
    assert flat["start_url"] == "https://ex.com"
    assert "feature_pipeline_enabled" in flat

    conn2 = FakeConn()
    save_worker_pipeline_config(conn2, {})
    assert conn2.executed == []

    conn3 = FakeConn()
    for _ in range(20):
        conn3.set_next_cursor(FakeCursor(fetchone_value=_row_for(CrawlSettings)))
    save_worker_pipeline_config(
        conn3,
        {
            "start_url": "https://save.com",
            "bing_webmaster_api_key": "secret",
            "mcp_token": "tok",
            "feature_chat_enabled": "false",
            "active_property_id": "3",
            "unknown_key": "ignored",
        },
    )
    assert conn3.executed

    conn4 = FakeConn()
    _queue_read(conn4, LlmSettings, provider="openai")
    conn4.set_next_cursor(FakeCursor(fetchall_value=[("openai", "sk-resolved", "gpt-4", None)]))
    llm_flat = load_worker_llm_config(conn4)
    assert llm_flat["llm_provider"] == "openai"
    assert llm_flat["llm_api_key"] == "sk-resolved"

    conn5 = FakeConn()
    save_worker_llm_config(conn5, {})
    assert conn5.executed == []

    conn6 = FakeConn()
    _queue_read(conn6, LlmSettings, provider="openai", max_pages=60)
    conn6.set_next_cursor(FakeCursor(fetchall_value=[]))
    save_worker_llm_config(
        conn6,
        {
            "llm_enabled": "true",
            "llm_max_pages": "80",
            "llm_api_key_openai": "sk-openai",
            "llm_model_groq": "llama",
            "llm_api_key": "sk-generic",
            "llm_provider": "openai",
        },
    )
    assert conn6.executed


def test_config_store_pipeline_llm_wrappers() -> None:
    from unittest.mock import patch

    from website_profiling.db.config_store import (
        read_llm_config,
        read_pipeline_config,
        write_llm_config,
        write_pipeline_config,
    )

    conn = FakeConn()
    with patch(
        "website_profiling.db.config_store.load_worker_pipeline_config",
        return_value={"start_url": "https://ex.com"},
    ):
        cfg, warnings = read_pipeline_config(conn)
        assert cfg["start_url"] == "https://ex.com"
        assert warnings == []

    with patch(
        "website_profiling.db.config_store.load_worker_pipeline_config",
        side_effect=RuntimeError("down"),
    ):
        cfg, warnings = read_pipeline_config(conn)
        assert cfg == {}
        assert warnings == []

    with patch("website_profiling.db.config_store.save_worker_pipeline_config") as save:
        write_pipeline_config(conn, {"start_url": "x"})
        save.assert_called_once()

    with patch(
        "website_profiling.db.config_store.load_worker_llm_config",
        return_value={"llm_provider": "none"},
    ):
        assert read_llm_config(conn)["llm_provider"] == "none"

    with patch(
        "website_profiling.db.config_store.load_worker_llm_config",
        side_effect=RuntimeError("down"),
    ):
        assert read_llm_config(conn) == {}

    with patch("website_profiling.db.config_store.save_worker_llm_config") as save:
        write_llm_config(conn, {"llm_provider": "openai"}, secret_keys={"x"})
        save.assert_called_once()
