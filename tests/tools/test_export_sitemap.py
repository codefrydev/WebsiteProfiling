"""Tests for sitemap XML export."""
from __future__ import annotations

import contextlib
from unittest.mock import MagicMock

import pytest

import website_profiling.db as db_pkg
from website_profiling.tools import export_sitemap as sitemap_mod
from website_profiling.tools.export_sitemap import build_sitemap_xml


@contextlib.contextmanager
def _fake_session():
    yield MagicMock()


def test_export_sitemap_loads_and_builds(monkeypatch) -> None:
    monkeypatch.setattr(db_pkg, "db_session", _fake_session)
    monkeypatch.setattr(
        db_pkg,
        "read_report_payload",
        lambda conn, rid: {"links": [{"url": "https://e.com/", "status": "200"}]},
    )
    xml = sitemap_mod.export_sitemap(1)
    assert "<urlset" in xml
    assert "https://e.com/" in xml


def test_export_sitemap_raises_when_no_payload(monkeypatch) -> None:
    monkeypatch.setattr(db_pkg, "db_session", _fake_session)
    monkeypatch.setattr(db_pkg, "read_report_payload", lambda conn, rid: None)
    with pytest.raises(FileNotFoundError):
        sitemap_mod.export_sitemap(99)


def test_build_sitemap_xml_includes_urls():
    payload = {
        "links": [
            {"url": "https://example.com/", "status": "200"},
            {"url": "https://example.com/about", "status": "301"},
            {"url": "https://example.com/missing", "status": "404"},
        ]
    }
    xml = build_sitemap_xml(payload)
    assert "<urlset" in xml
    assert xml.count("<loc>") == 1
    assert "https://example.com/" in xml


def test_build_sitemap_xml_empty_links():
    assert "<urlset" in build_sitemap_xml({"links": []})


def test_build_sitemap_xml_skips_noindex_and_non_dict():
    payload = {
        "links": [
            "bad",
            {"url": "https://example.com/private", "status": "200", "noindex": True},
            {"url": "https://example.com/ok", "status": "200"},
        ]
    }
    xml = build_sitemap_xml(payload, max_urls=10)
    assert xml.count("<loc>") == 1
