"""Bing Webmaster API helper tests (mocked HTTP)."""
import json
from pathlib import Path
from unittest.mock import patch

import pytest

from website_profiling.integrations.bing.webmaster import fetch_bing_backlinks_summary

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "bing"


def _load_fixture(name: str) -> dict:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


def test_fetch_bing_backlinks_summary_requires_credentials() -> None:
    result = fetch_bing_backlinks_summary("", "")
    assert result["ok"] is False


@patch("website_profiling.integrations.bing.webmaster._bing_json_get")
def test_fetch_bing_backlinks_summary_parses_links(mock_get) -> None:
    mock_get.return_value = _load_fixture("get_link_counts.json")
    result = fetch_bing_backlinks_summary("key", "https://example.com")
    assert result["ok"] is True
    assert result["linked_page_count"] == 2
    assert result["total_inbound_links"] == 4
    assert result["linked_pages"][0]["url"] == "https://example.com/a"


@patch("website_profiling.integrations.bing.webmaster._bing_json_get")
def test_fetch_bing_backlinks_summary_handles_api_error(mock_get) -> None:
    mock_get.return_value = _load_fixture("error_401.json")
    result = fetch_bing_backlinks_summary("bad-key", "https://example.com")
    assert result["ok"] is False
    assert "Invalid API key" in result["error"]


@patch("website_profiling.integrations.bing.webmaster._bing_json_get")
def test_fetch_bing_backlinks_summary_empty_links(mock_get) -> None:
    mock_get.return_value = {"d": {"Links": [], "TotalPages": 0}}
    result = fetch_bing_backlinks_summary("key", "https://example.com")
    assert result["ok"] is True
    assert result["linked_page_count"] == 0
    assert result["total_inbound_links"] == 0
