"""Unit tests for property_store (FakeConn, no PostgreSQL)."""
from __future__ import annotations

from datetime import datetime, timezone

import pytest

from tests.db_test_fakes import FakeConn, FakeCursor


def _property_row(
    *,
    pid: int = 1,
    connected_at: datetime | None = None,
    crawl_auth: datetime | None = None,
) -> tuple:
    return (
        pid,
        "example.com",
        "example.com",
        "https://example.com",
        "https://example.com/",
        "properties/123",
        "oauth",
        "refresh-token",
        connected_at,
        "user@example.com",
        28,
        None,
        crawl_auth,
    )


def test_resolve_property_id_from_start_url_empty() -> None:
    from website_profiling.db.property_store import resolve_property_id_from_start_url

    assert resolve_property_id_from_start_url(FakeConn(), "") is None


def test_derive_property_name() -> None:
    from website_profiling.db.property_store import derive_property_name

    assert derive_property_name("example.com") == "example.com"
    assert derive_property_name("", "https://www.site.org/path") == "www.site.org"


def test_upsert_property_by_domain() -> None:
    from website_profiling.db.property_store import upsert_property_by_domain

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=(42,)))
    pid = upsert_property_by_domain(conn, "Example", "example.com", "https://example.com")
    assert pid == 42
    assert conn.commits == 1
    assert "INSERT INTO properties" in conn.executed[0][0]


def test_upsert_property_by_domain_requires_domain() -> None:
    from website_profiling.db.property_store import upsert_property_by_domain

    with pytest.raises(ValueError, match="canonical_domain"):
        upsert_property_by_domain(FakeConn(), "x", "")


def test_get_property_by_domain_and_id() -> None:
    from website_profiling.db.property_store import get_property_by_domain, get_property_by_id

    dt = datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    row = _property_row(connected_at=dt, crawl_auth=dt)
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=row))
    prop = get_property_by_domain(conn, "Example.COM")
    assert prop is not None
    assert prop["id"] == 1
    assert prop["canonical_domain"] == "example.com"
    assert prop["google_connected_at"] == dt.isoformat()
    assert prop["crawl_authorized_at"] == dt.isoformat()

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value=None))
    assert get_property_by_domain(conn2, "missing.com") is None

    conn3 = FakeConn()
    conn3.set_next_cursor(FakeCursor(fetchone_value=row))
    assert get_property_by_id(conn3, 1)["name"] == "example.com"


def test_resolve_property_id_from_start_url_existing_and_create() -> None:
    from website_profiling.db.property_store import resolve_property_id_from_start_url

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=_property_row(pid=5)))
    assert resolve_property_id_from_start_url(conn, "https://example.com") == 5

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value=None))
    conn2.set_next_cursor(FakeCursor(fetchone_value=(99,)))
    assert resolve_property_id_from_start_url(conn2, "https://new.example") == 99
    assert conn2.commits == 1


def test_update_property_google_noop_when_empty_patch() -> None:
    from website_profiling.db.property_store import update_property_google

    conn = FakeConn()
    update_property_google(conn, 1, {"not_allowed": "x"})
    assert conn.executed == []
    assert conn.commits == 0


def test_update_property_google_and_config() -> None:
    from website_profiling.db.property_store import (
        get_property_google_config,
        update_property_google,
    )

    conn = FakeConn()
    update_property_google(conn, 3, {"gsc_site_url": "https://gsc/", "ignored_key": 1})
    assert conn.commits == 1
    assert "UPDATE properties" in conn.executed[0][0]

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value=_property_row(pid=3)))
    cfg = get_property_google_config(conn2, 3)
    assert cfg["property_id"] == 3
    assert cfg["gsc_site_url"] == "https://example.com/"

    conn3 = FakeConn()
    conn3.set_next_cursor(FakeCursor(fetchone_value=None))
    with pytest.raises(RuntimeError, match="not found"):
        get_property_google_config(conn3, 404)


def test_list_properties_public() -> None:
    from website_profiling.db.property_store import list_properties_public

    dt = datetime(2024, 1, 2, tzinfo=timezone.utc)
    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                (
                    1,
                    "a.com",
                    "a.com",
                    "https://a.com",
                    None,
                    None,
                    None,
                    dt,
                    "a@a.com",
                    28,
                    None,
                ),
            ]
        )
    )
    rows = list_properties_public(conn)
    assert len(rows) == 1
    assert rows[0]["google_connected"] is True
    assert rows[0]["google_connected_at"] == dt.isoformat()
