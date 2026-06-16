"""Tests for builder image inventory and ref collection."""
from __future__ import annotations

from unittest.mock import patch

from website_profiling.analysis.image_probe import collect_image_refs_from_links
from website_profiling.reporting.builder import _build_image_inventory


def test_build_image_inventory_disabled() -> None:
    links = [{"url": "https://ex.com/", "page_analysis": {"image_urls": ["https://cdn.ex.com/a.png"]}}]
    inventory, summary = _build_image_inventory(links, {"probe_image_inventory": "false"})
    assert inventory == []
    assert summary["inventory_available"] is False
    assert summary["probed"] == 0


def test_build_image_inventory_with_probe_mock() -> None:
    links = [
        {
            "url": "https://ex.com/page",
            "page_analysis": {"image_urls": ["https://cdn.ex.com/heavy.png"]},
        },
    ]
    probed = [
        {
            "url": "https://cdn.ex.com/heavy.png",
            "status": 200,
            "content_type": "image/png",
            "size_bytes": 300_000,
            "error": None,
        },
    ]
    with patch("website_profiling.analysis.image_probe.probe_image_urls", return_value=probed):
        inventory, summary = _build_image_inventory(
            links,
            {
                "probe_image_inventory": "true",
                "max_image_probe_urls": "500",
                "image_unoptimized_min_kb": "200",
            },
        )
    assert summary["inventory_available"] is True
    assert summary["probed"] == 1
    assert summary["over_threshold_count"] == 1
    assert len(inventory) == 1
    assert inventory[0]["source_pages"] == ["https://ex.com/page"]
    assert inventory[0]["kinds"] == ["content"]


def test_collect_refs_skips_invalid() -> None:
    refs = collect_image_refs_from_links([
        {"url": "https://ex.com/", "page_analysis": {"image_urls": ["data:image/png;base64,x"]}},
    ])
    assert refs == {}
