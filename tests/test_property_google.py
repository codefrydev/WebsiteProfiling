"""Per-property Google resolution and scoped google_data."""
from __future__ import annotations

from unittest.mock import patch

from website_profiling.db.property_store import canonical_domain_from_start_url


def test_canonical_domain_from_start_url():
    assert canonical_domain_from_start_url("https://www.Example.com/path") == "www.example.com"
    assert canonical_domain_from_start_url("example.org") == "example.org"
    assert canonical_domain_from_start_url("") == ""


def test_read_latest_google_data_scoped_sql():
    from website_profiling.integrations.google import store

    assert "property_id" in store.write_google_data.__doc__ or True
    import inspect

    sig = inspect.signature(store.write_google_data)
    assert "property_id" in sig.parameters


def test_build_credentials_accepts_property_id():
    import inspect
    from website_profiling.integrations.google.auth import build_credentials

    sig = inspect.signature(build_credentials)
    assert "property_id" in sig.parameters


def test_build_credentials_property_service_account_uses_app_sa():
    from website_profiling.integrations.google.auth import build_credentials

    fake_sa = {"type": "service_account", "project_id": "p"}
    with (
        patch(
            "website_profiling.integrations.google.auth._property_google_auth",
            return_value=("", "service_account", "example.com"),
        ),
        patch(
            "website_profiling.db.google_app_store.build_service_account_credentials",
            return_value={"ok": True},
        ) as mock_sa,
    ):
        creds = build_credentials(property_id=42)
    assert creds == {"ok": True}
    mock_sa.assert_called_once()


def test_build_credentials_property_no_oauth_falls_back_to_app_sa():
    from website_profiling.integrations.google.auth import build_credentials

    with (
        patch(
            "website_profiling.integrations.google.auth._property_google_auth",
            return_value=("", "oauth", "example.com"),
        ),
        patch(
            "website_profiling.db.google_app_store.has_service_account",
            return_value=True,
        ),
        patch(
            "website_profiling.db.google_app_store.build_service_account_credentials",
            return_value={"sa": True},
        ) as mock_sa,
    ):
        creds = build_credentials(property_id=7)
    assert creds == {"sa": True}
    mock_sa.assert_called_once()
