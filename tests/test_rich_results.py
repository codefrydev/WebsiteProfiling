"""Tests for Rich Results validation helpers."""
from __future__ import annotations

from website_profiling.integrations.google.rich_results import validate_urls


def test_validate_urls_local_pass_with_schema_types():
    links = {
        "https://ex.com/": {
            "url": "https://ex.com/",
            "has_schema": True,
            "page_analysis": {"json_ld_types": ["Organization", "WebSite"]},
        }
    }
    rows = validate_urls(["https://ex.com/"], links_by_url=links)
    assert len(rows) == 1
    assert rows[0]["status"] == "pass"
    assert "Organization" in rows[0]["message"]
    assert rows[0]["provenance"] == "Crawl analysis"


def test_validate_urls_local_warning_for_json_ld_issue():
    links = {
        "https://ex.com/bad": {
            "url": "https://ex.com/bad",
            "has_schema": True,
            "page_analysis": {
                "warnings": [
                    {"code": "json_ld_missing_type", "message": "JSON-LD missing @type"},
                ]
            },
        }
    }
    rows = validate_urls(["https://ex.com/bad"], links_by_url=links)
    assert rows[0]["status"] == "warning"
    assert rows[0]["issues"]


def test_validate_urls_local_no_schema():
    rows = validate_urls(["https://ex.com/plain"], links_by_url={})
    assert rows[0]["status"] in ("info", "skipped")
