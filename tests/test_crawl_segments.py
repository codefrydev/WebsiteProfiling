"""Tests for crawl segment health scores."""
from __future__ import annotations

import pandas as pd

from website_profiling.reporting.crawl_segments import build_crawl_segments


def test_build_crawl_segments_groups_by_prefix() -> None:
    df = pd.DataFrame([
        {"url": "https://example.com/blog/a"},
        {"url": "https://example.com/blog/b"},
        {"url": "https://example.com/about"},
    ])
    categories = [{"id": "technical_seo", "score": 80}, {"id": "link_health", "score": 60}]
    out = build_crawl_segments(df, categories, ["/blog"])
    assert out is not None
    assert out["overall_health"] == 70
    seg = out["segments"][0]
    assert seg["prefix"] == "/blog"
    assert seg["url_count"] == 2


def test_build_crawl_segments_empty_prefixes() -> None:
    df = pd.DataFrame([{"url": "https://example.com/"}])
    assert build_crawl_segments(df, [], []) is None


def test_build_crawl_segments_handles_bad_url() -> None:
    from unittest.mock import patch

    df = pd.DataFrame([{"url": "/not-a-valid-url"}])
    with patch("website_profiling.reporting.crawl_segments.urlparse", side_effect=ValueError("bad")):
        out = build_crawl_segments(df, [{"id": "x", "score": 80}], ["/not-a-valid-url"])
    assert out is not None
    assert out["segments"][0]["url_count"] == 1
