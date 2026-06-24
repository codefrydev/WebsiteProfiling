"""Regression tests for /api/report/export* endpoints.

These guard the bug where the router passed a `conn` argument the export
helpers don't accept (CSV/JSON -> TypeError -> 500) and imported a non-existent
`export_sitemap` symbol (sitemap -> ImportError -> 501).
"""
from __future__ import annotations

import contextlib
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from website_profiling.api.deps import get_db
from website_profiling.api.main import app

_PAYLOAD = {
    "site_name": "Example",
    "report_generated_at": "2026-01-01",
    "links": [
        {
            "url": "https://example.com/",
            "status": "200",
            "title": "Home",
            "inlinks": 3,
            "word_count": 100,
        },
    ],
    "categories": [],
}


def _fake_db():
    yield MagicMock()


def _client() -> TestClient:
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_export_csv_returns_200() -> None:
    with patch("website_profiling.tools.export_audit._load_payload", return_value=_PAYLOAD):
        resp = _client().get("/api/report/export?format=csv&reportId=1")
    assert resp.status_code == 200
    assert "example.com" in resp.text


def test_export_json_returns_200() -> None:
    with patch("website_profiling.tools.export_audit._load_payload", return_value=_PAYLOAD):
        resp = _client().get("/api/report/export?format=json&reportId=1")
    assert resp.status_code == 200
    assert resp.json()["site_name"] == "Example"


def test_export_sitemap_returns_200() -> None:
    @contextlib.contextmanager
    def _fake_session():
        yield MagicMock()

    with patch("website_profiling.db.db_session", _fake_session), patch(
        "website_profiling.db.read_report_payload", return_value=_PAYLOAD
    ):
        resp = _client().get("/api/report/export-sitemap?reportId=1")
    assert resp.status_code == 200
    assert "<urlset" in resp.text
    assert "example.com" in resp.text
