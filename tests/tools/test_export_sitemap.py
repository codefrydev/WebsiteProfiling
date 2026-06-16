"""Tests for sitemap XML export."""
from __future__ import annotations

from website_profiling.tools.export_sitemap import build_sitemap_xml


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
