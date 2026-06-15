"""Tests for indexation coverage helpers."""
from __future__ import annotations

from unittest.mock import patch

import pandas as pd

from website_profiling.reporting.indexation import (
    build_indexation_coverage,
    _success_urls,
    _gsc_page_urls,
    _gsc_by_page,
)


def test_success_urls_filters_non_200() -> None:
    df = pd.DataFrame([
        {"url": "https://example.com/a", "status": "200"},
        {"url": "https://example.com/b", "status": "404"},
    ])
    urls = _success_urls(df)
    assert urls == ["https://example.com/a"]


def test_gsc_page_urls_extracts_top_pages() -> None:
    google = {
        "gsc": {
            "top_pages": [
                {"page": "https://example.com/x"},
                {"url": "https://example.com/y"},
            ]
        }
    }
    assert len(_gsc_page_urls(google)) == 2


def test_gsc_page_urls_legacy_pages_fallback() -> None:
    google = {"gsc": {"pages": [{"page": "https://example.com/x"}]}}
    assert _gsc_page_urls(google) == ["https://example.com/x"]


@patch("website_profiling.reporting.indexation.discover_sitemap_urls")
def test_build_indexation_coverage_lists(mock_sitemap) -> None:
    mock_sitemap.return_value = ["https://example.com/", "https://example.com/sitemap-only"]
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200"}])
    google = {"gsc": {"top_pages": [{"page": "https://example.com/gsc-only"}]}}
    out = build_indexation_coverage(df, "https://example.com/", google)
    assert out["counts"]["crawled"] == 1
    assert out["counts"]["sitemap_only"] >= 1
    assert "sitemap_only" in out["lists"]


@patch("website_profiling.reporting.indexation.discover_sitemap_urls")
def test_build_indexation_coverage_gsc_not_crawled(mock_sitemap) -> None:
    mock_sitemap.return_value = []
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200"}])
    google = {"gsc": {"top_pages": [{"page": "https://example.com/gsc-only"}]}}
    out = build_indexation_coverage(df, "https://example.com/", google)
    assert out["counts"]["gsc_pages"] == 1
    assert "https://example.com/gsc-only" in out["lists"]["gsc_not_crawled"]


def test_success_urls_empty_dataframe() -> None:
    assert _success_urls(pd.DataFrame()) == []


def test_success_urls_without_status_column() -> None:
    df = pd.DataFrame([{"url": "https://example.com/a"}, {"url": ""}])
    assert _success_urls(df) == ["https://example.com/a"]


def test_gsc_page_urls_none_google_data() -> None:
    assert _gsc_page_urls(None) == []


def test_gsc_by_page_none_google_data() -> None:
    assert _gsc_by_page(None) == {}
