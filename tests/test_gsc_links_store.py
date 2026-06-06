"""Tests for gsc_links_data store (requires PostgreSQL)."""
from __future__ import annotations

import os

import pytest

from website_profiling.db import db_session
from website_profiling.db.property_store import upsert_property_by_domain
from website_profiling.integrations.google.gsc_links_store import (
    import_gsc_links_csv,
    read_gsc_links_status,
    read_latest_gsc_links_data,
)


@pytest.fixture
def property_id():
    if not (os.environ.get("DATABASE_URL") or "").strip():
        pytest.skip("DATABASE_URL not set")
    with db_session() as conn:
        pid = upsert_property_by_domain(conn, "GSC Links Test", "gsc-links-test.example")
    yield pid


@pytest.mark.integration
def test_import_and_read_roundtrip(property_id):
    csv_text = "Site,Links,Target pages\nexample.com,5,2\n"
    with db_session() as conn:
        result = import_gsc_links_csv(conn, property_id, csv_text, file_name="sites.csv")
        assert result["ok"] is True
        assert "top_linking_sites" in result["export_types"]

        latest = read_latest_gsc_links_data(conn, property_id, for_report=False)
        assert latest is not None
        assert len(latest.get("top_linking_sites") or []) == 1

        status = read_gsc_links_status(conn, property_id)
        assert status["hasData"] is True
        assert status["referringDomainCount"] == 1


@pytest.mark.integration
def test_merge_second_import(property_id):
    with db_session() as conn:
        import_gsc_links_csv(
            conn,
            property_id,
            "Site,Links,Target pages\na.com,1,1\n",
        )
        import_gsc_links_csv(
            conn,
            property_id,
            "Target page,Links,Linking sites\nhttps://a.com/,3,2\n",
        )
        latest = read_latest_gsc_links_data(conn, property_id, for_report=False)
        assert latest is not None
        assert len(latest.get("top_linking_sites") or []) == 1
        assert len(latest.get("top_linked_pages") or []) == 1
