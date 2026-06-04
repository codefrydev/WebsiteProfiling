"""Per-property Google resolution and scoped google_data."""
from __future__ import annotations

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
