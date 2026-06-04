"""Tests for google_app_settings DB store and auth credential resolution."""
from __future__ import annotations

import inspect
from unittest.mock import MagicMock, patch

import pytest

from website_profiling.db import google_app_store
from website_profiling.integrations.google import auth


def test_read_google_app_settings_empty_row():
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = None
    row = google_app_store.read_google_app_settings(conn)
    assert row["client_id"] == ""
    assert row["client_secret"] == ""
    assert row["default_date_range_days"] == 28


def test_read_google_app_settings_dict_row():
    """Pool uses psycopg dict_row; integer indexing must not be required."""
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {
        "id": 1,
        "client_id": " cid.apps.googleusercontent.com ",
        "client_secret": " secret ",
        "service_account_json": None,
        "default_date_range_days": 90,
        "updated_at": None,
    }
    row = google_app_store.read_google_app_settings(conn)
    assert row["client_id"] == "cid.apps.googleusercontent.com"
    assert row["client_secret"] == "secret"
    assert row["default_date_range_days"] == 90


def test_read_google_app_settings_without_conn(monkeypatch) -> None:
    from tests.db_test_fakes import FakeConn, FakeCursor

    class _Ctx:
        def __enter__(self):
            return conn

        def __exit__(self, _t, _v, _tb):
            return False

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchone_value={
                "id": 1,
                "client_id": "cid",
                "client_secret": "sec",
                "service_account_json": None,
                "default_date_range_days": 14,
                "updated_at": None,
            }
        )
    )
    monkeypatch.setattr("website_profiling.db.pool.db_session", lambda: _Ctx())
    row = google_app_store.read_google_app_settings()
    assert row["client_id"] == "cid"
    assert row["default_date_range_days"] == 14


def test_save_google_app_settings_noop_on_empty_patch() -> None:
    conn = MagicMock()
    google_app_store.save_google_app_settings(conn, {})
    conn.execute.assert_not_called()


def test_save_google_app_settings_service_account_json() -> None:
    conn = MagicMock()
    google_app_store.save_google_app_settings(
        conn,
        {"service_account_json": {"type": "service_account", "project_id": "p"}},
    )
    conn.execute.assert_called_once()
    assert "service_account_json" in conn.execute.call_args[0][0]


def test_has_service_account_and_default_date_range_days() -> None:
    assert google_app_store.has_service_account({"service_account_json": {"k": 1}}) is True
    assert google_app_store.has_service_account({"service_account_json": None}) is False
    assert google_app_store.default_date_range_days({"default_date_range_days": 90}) == 90


def test_build_service_account_credentials_requires_json() -> None:
    with pytest.raises(RuntimeError, match="No service account"):
        google_app_store.build_service_account_credentials({"service_account_json": "not-a-dict"})


def test_save_google_app_settings_updates_fields():
    conn = MagicMock()
    google_app_store.save_google_app_settings(
        conn,
        {
            "client_id": "cid.apps.googleusercontent.com",
            "client_secret": "secret",
            "default_date_range_days": 90,
        },
    )
    conn.execute.assert_called_once()
    conn.commit.assert_called_once()
    sql = conn.execute.call_args[0][0]
    assert "client_id" in sql
    assert "client_secret" in sql


def test_app_client_credentials_falls_back_to_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "env-id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "env-secret")
    cid, secret = google_app_store.app_client_credentials(
        {"client_id": "", "client_secret": ""},
    )
    assert cid == "env-id"
    assert secret == "env-secret"


def test_app_client_credentials_missing_raises():
    with pytest.raises(RuntimeError, match="Client ID or Secret missing"):
        google_app_store.app_client_credentials(
            {"client_id": "", "client_secret": ""},
        )


def test_build_credentials_requires_property_without_service_account():
    with patch(
        "website_profiling.db.google_app_store.has_service_account",
        return_value=False,
    ):
        with pytest.raises(RuntimeError, match="property context"):
            auth.build_credentials(property_id=None)


def test_read_secrets_compat_shim_no_global_token():
    fake_row = {
        "client_id": "a",
        "client_secret": "b",
        "service_account_json": None,
        "default_date_range_days": 28,
    }
    with patch(
        "website_profiling.db.google_app_store.read_google_app_settings",
        return_value=fake_row,
    ):
        data = auth.read_secrets()
    assert data["clientId"] == "a"
    assert data["refreshToken"] is None
    assert data["gscSiteUrl"] is None


def test_resolve_google_targets_requires_property_id():
    with patch(
        "website_profiling.db.google_app_store.default_date_range_days",
        return_value=28,
    ):
        with pytest.raises(RuntimeError, match="No property selected"):
            auth.resolve_google_targets(property_id=None)


def test_build_credentials_signature():
    sig = inspect.signature(auth.build_credentials)
    assert "property_id" in sig.parameters
    assert "credentials_path" not in sig.parameters
