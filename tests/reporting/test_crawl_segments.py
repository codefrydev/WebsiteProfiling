"""Tests for crawl segment health scores."""
from __future__ import annotations

import pandas as pd

from website_profiling.reporting.crawl_segments import (
    _is_regex,
    _matches_path,
    _segment_health,
    build_crawl_segments,
)


# ---------------------------------------------------------------------------
# _is_regex
# ---------------------------------------------------------------------------

def test_is_regex_plain_prefix() -> None:
    assert _is_regex("/blog") is False
    assert _is_regex("/api/v1") is False
    assert _is_regex("/products-new") is False


def test_is_regex_dotstar_pattern() -> None:
    assert _is_regex("/blog/.*") is True
    assert _is_regex("/api/.*") is True


def test_is_regex_dotplus_pattern() -> None:
    assert _is_regex("/api/.+") is True


def test_is_regex_shorthand_class() -> None:
    assert _is_regex(r"/api/v\d+") is True
    assert _is_regex(r"/path/\w+") is True


def test_is_regex_character_class() -> None:
    assert _is_regex("/api/[v][0-9]") is True


def test_is_regex_group() -> None:
    assert _is_regex("/(blog|news)/") is True


def test_is_regex_dollar_anchor() -> None:
    assert _is_regex("/blog$") is True


def test_is_regex_single_dot_not_flagged() -> None:
    """A plain dot in a path like /api/v1.0 should NOT be treated as regex."""
    assert _is_regex("/api/v1.0") is False


# ---------------------------------------------------------------------------
# _matches_path
# ---------------------------------------------------------------------------

def test_matches_path_prefix_exact() -> None:
    assert _matches_path("/blog", "/blog", False, "/blog") is True


def test_matches_path_prefix_child() -> None:
    assert _matches_path("/blog/post-1", "/blog", False, "/blog") is True


def test_matches_path_prefix_no_match() -> None:
    assert _matches_path("/about", "/blog", False, "/blog") is False
    assert _matches_path("/blogger", "/blog", False, "/blog") is False


def test_matches_path_regex() -> None:
    import re
    pattern = "/api/.*"
    compiled = re.compile(pattern)
    assert _matches_path("/api/v1/users", pattern, True, compiled) is True
    assert _matches_path("/about", pattern, True, compiled) is False


# ---------------------------------------------------------------------------
# _segment_health
# ---------------------------------------------------------------------------

def test_segment_health_all_ok() -> None:
    df = pd.DataFrame([
        {"url": "https://ex.com/a", "status": 200, "title": "A", "meta_description": "desc"},
        {"url": "https://ex.com/b", "status": 200, "title": "B", "meta_description": "desc"},
    ])
    assert _segment_health(df) == 100


def test_segment_health_empty_df() -> None:
    assert _segment_health(pd.DataFrame()) == 0


def test_segment_health_error_status_deduction() -> None:
    """50% 4xx → deducts 15 pts (50% of 30)."""
    df = pd.DataFrame([
        {"status": 200}, {"status": 200},
        {"status": 404}, {"status": 404},
    ])
    score = _segment_health(df)
    assert score == 85  # 100 - round(30 * 0.5) = 85


def test_segment_health_missing_title_deduction() -> None:
    """All titles missing → full 20-pt deduction."""
    df = pd.DataFrame([{"status": 200, "title": ""} for _ in range(5)])
    score = _segment_health(df)
    assert score == 80  # 100 - 20


def test_segment_health_missing_description_deduction() -> None:
    """All descriptions missing → full 10-pt deduction."""
    df = pd.DataFrame([{"status": 200, "title": "T", "meta_description": ""} for _ in range(5)])
    score = _segment_health(df)
    assert score == 90  # 100 - 10


def test_segment_health_missing_viewport_deduction() -> None:
    """All viewport missing → full 10-pt deduction."""
    df = pd.DataFrame([{"status": 200, "title": "T", "viewport_present": False} for _ in range(5)])
    score = _segment_health(df)
    assert score == 90  # 100 - 10


def test_segment_health_clamped_to_zero() -> None:
    """Multiple deductions stack: 100 - 30(status) - 20(title) - 10(desc) - 10(viewport) = 30."""
    df = pd.DataFrame([
        {"status": 500, "title": "", "meta_description": "", "viewport_present": False}
        for _ in range(10)
    ])
    assert _segment_health(df) == 30


def test_segment_health_small_missing_rate_no_deduction() -> None:
    """Under 10% missing rate triggers no deduction."""
    rows = [{"status": 200, "title": "T", "meta_description": "D"} for _ in range(10)]
    rows[0]["title"] = ""  # 10% — threshold is > 10%, so no deduction
    df = pd.DataFrame(rows)
    assert _segment_health(df) == 100


# ---------------------------------------------------------------------------
# build_crawl_segments
# ---------------------------------------------------------------------------

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
    assert seg["pattern_type"] == "prefix"


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


def test_build_crawl_segments_regex_pattern() -> None:
    """Regex pattern /blog/.* matches /blog/post-1 and /blog/post-2."""
    df = pd.DataFrame([
        {"url": "https://example.com/blog/post-1"},
        {"url": "https://example.com/blog/post-2"},
        {"url": "https://example.com/about"},
    ])
    out = build_crawl_segments(df, [], ["/blog/.*"])
    assert out is not None
    seg = out["segments"][0]
    assert seg["url_count"] == 2
    assert seg["pattern_type"] == "regex"


def test_build_crawl_segments_mixed_prefix_and_regex() -> None:
    """Mixed literal prefix and regex in the same list."""
    df = pd.DataFrame([
        {"url": "https://example.com/blog/a", "status": 200, "title": "T"},
        {"url": "https://example.com/api/v1/users", "status": 200, "title": "T"},
        {"url": "https://example.com/api/v2/items", "status": 200, "title": "T"},
        {"url": "https://example.com/about", "status": 200, "title": "T"},
    ])
    out = build_crawl_segments(df, [], ["/blog", r"/api/v\d+"])
    assert out is not None
    assert len(out["segments"]) == 2
    blog_seg = next(s for s in out["segments"] if s["prefix"] == "/blog")
    api_seg = next(s for s in out["segments"] if "api" in s["prefix"])
    assert blog_seg["url_count"] == 1
    assert blog_seg["pattern_type"] == "prefix"
    assert api_seg["url_count"] == 2
    assert api_seg["pattern_type"] == "regex"


def test_build_crawl_segments_per_segment_health_differs() -> None:
    """Segments with different URL subsets get different health scores."""
    df = pd.DataFrame([
        # /good: all 200, all have titles
        {"url": "https://ex.com/good/a", "status": 200, "title": "A"},
        {"url": "https://ex.com/good/b", "status": 200, "title": "B"},
        # /bad: all 500, no titles
        {"url": "https://ex.com/bad/a", "status": 500, "title": ""},
        {"url": "https://ex.com/bad/b", "status": 500, "title": ""},
    ])
    out = build_crawl_segments(df, [], ["/good", "/bad"])
    assert out is not None
    segs = {s["prefix"]: s for s in out["segments"]}
    assert segs["/good"]["health_score"] == 100
    # /bad: 100% 500 status (−30) + 100% missing title (−20) = 50
    assert segs["/bad"]["health_score"] == 50


def test_build_crawl_segments_invalid_regex_falls_back_to_prefix() -> None:
    """An invalid regex is silently treated as a literal prefix."""
    df = pd.DataFrame([{"url": "https://example.com/[invalid"}])
    # "[invalid" looks like a regex (contains "[") but won't compile → fallback to prefix
    out = build_crawl_segments(df, [], ["[invalid"])
    assert out is not None
    seg = out["segments"][0]
    assert seg["pattern_type"] == "prefix"


def test_build_crawl_segments_no_categories_overall_health_is_none() -> None:
    df = pd.DataFrame([{"url": "https://example.com/blog/a"}])
    out = build_crawl_segments(df, [], ["/blog"])
    assert out is not None
    assert out["overall_health"] is None


def test_build_crawl_segments_prefix_without_leading_slash() -> None:
    """Prefixes without a leading slash get one added automatically."""
    df = pd.DataFrame([
        {"url": "https://example.com/blog/post"},
        {"url": "https://example.com/about"},
    ])
    out = build_crawl_segments(df, [], ["blog"])
    assert out is not None
    seg = out["segments"][0]
    assert seg["prefix"] == "/blog"
    assert seg["url_count"] == 1


def test_build_crawl_segments_zero_match() -> None:
    """Segment with no matching URLs gets health_score of 0."""
    df = pd.DataFrame([{"url": "https://example.com/about"}])
    out = build_crawl_segments(df, [], ["/blog"])
    assert out is not None
    assert out["segments"][0]["url_count"] == 0
    assert out["segments"][0]["health_score"] == 0
