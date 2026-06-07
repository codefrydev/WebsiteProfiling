"""Tests for crawl preset patches (scheduled audits)."""
from __future__ import annotations

from website_profiling.crawl_presets import apply_crawl_preset


def test_apply_spa_preset_merges_config() -> None:
    merged = apply_crawl_preset("spa", {"start_url": "https://example.com", "max_pages": "100"})
    assert merged["start_url"] == "https://example.com"
    assert merged["max_pages"] == "2000"
    assert merged["crawl_render_mode"] == "auto"
    assert merged["crawl_stream_to_db"] == "true"


def test_unknown_preset_falls_back_to_starter() -> None:
    merged = apply_crawl_preset("unknown", {})
    assert merged["max_pages"] == "500"
    assert merged["crawl_render_mode"] == "static"
