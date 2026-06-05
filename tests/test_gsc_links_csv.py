"""Tests for GSC Links CSV parser."""
from __future__ import annotations

from pathlib import Path

import pytest

from website_profiling.integrations.google.gsc_links_csv import (
    detect_export_type,
    merge_parsed_into_snapshot,
    parse_and_merge,
    parse_gsc_links_csv,
)

FIXTURES = Path(__file__).resolve().parent / "fixtures" / "gsc_links"


@pytest.mark.parametrize(
    "filename,expected_type,min_rows",
    [
        ("top_linking_sites.csv", "top_linking_sites", 3),
        ("top_linked_pages.csv", "top_linked_pages", 2),
        ("top_linking_text.csv", "top_linking_text", 3),
        ("sample_links.csv", "sample_links", 2),
        ("latest_links.csv", "latest_links", 1),
    ],
)
def test_parse_gsc_links_fixture_files(filename, expected_type, min_rows):
    text = (FIXTURES / filename).read_text(encoding="utf-8")
    export_type, rows = parse_gsc_links_csv(text)
    assert export_type == expected_type
    assert len(rows) >= min_rows


def test_detect_export_type_from_headers():
    assert detect_export_type(["Site", "Links", "Target pages"]) == "top_linking_sites"
    assert detect_export_type(["Target page", "Links", "Linking sites"]) == "top_linked_pages"
    assert detect_export_type(["Link text", "Links"]) == "top_linking_text"
    assert detect_export_type(["Source page", "Target page"]) == "sample_links"
    assert detect_export_type(["Source page", "Target page", "First discovered"]) == "latest_links"


def test_parse_empty_raises():
    with pytest.raises(ValueError, match="empty"):
        parse_gsc_links_csv("")


def test_parse_unknown_raises():
    with pytest.raises(ValueError, match="Unrecognized"):
        parse_gsc_links_csv("foo,bar\n1,2")


def test_merge_replaces_same_section():
    base = merge_parsed_into_snapshot(None, "top_linking_sites", [{"site": "a.com", "link_count": 1, "target_page_count": 1}])
    merged = merge_parsed_into_snapshot(
        base,
        "top_linking_sites",
        [{"site": "b.com", "link_count": 2, "target_page_count": 3}],
    )
    assert merged["top_linking_sites"][0]["site"] == "b.com"
    assert "top_linking_sites" in merged["export_types"]


def test_parse_and_merge_accumulates_sections():
    sites = (FIXTURES / "top_linking_sites.csv").read_text(encoding="utf-8")
    pages = (FIXTURES / "top_linked_pages.csv").read_text(encoding="utf-8")
    snap = parse_and_merge(sites, None, crawl_urls=["https://example.com/"])
    snap = parse_and_merge(pages, snap, crawl_urls=["https://example.com/"])
    assert "top_linking_sites" in snap["export_types"]
    assert "top_linked_pages" in snap["export_types"]
    assert snap["top_linked_pages"][0].get("target_in_crawl") is True
