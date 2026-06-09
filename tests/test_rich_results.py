"""Tests for Rich Results validation helpers."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.integrations.google.rich_results import (
    summarize_rich_results,
    validate_urls,
)


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


def test_summarize_rich_results_provenance():
    rows = [
        {"source": "gsc", "provenance": "Google Search Console"},
        {"source": "crawl", "provenance": "Crawl analysis"},
        {"source": "api", "provenance": "Google Rich Results API"},
    ]
    meta = summarize_rich_results(rows)
    assert meta["checked"] == 3
    assert meta["gsc_count"] == 1
    assert meta["api_count"] == 1
    assert meta["heuristic_count"] == 1


def test_validate_urls_uses_api_when_no_gsc():
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "richResultsOutcome": {"verdict": "PASS", "detectedItems": [{"richResultType": "Product"}]},
    }
    with patch("website_profiling.integrations.google.rich_results.requests.post", return_value=mock_resp):
        rows = validate_urls(["https://ex.com/p"], api_key="test-key", links_by_url={})
    assert rows[0]["source"] == "api"
    assert rows[0]["status"] == "pass"
