"""Tests for text content analysis aggregation in report builder."""

import json

import pandas as pd

from website_profiling.reporting.builder import _build_text_content_analysis


def _df(rows: list[dict]) -> pd.DataFrame:
    return pd.DataFrame(rows)


def test_keyword_index_aggregates_across_pages() -> None:
    df = _df(
        [
            {
                "url": "https://example.com/a",
                "status": "200",
                "top_keywords": json.dumps([{"word": "games", "count": 5}, {"word": "reviews", "count": 2}]),
            },
            {
                "url": "https://example.com/b",
                "status": "200",
                "top_keywords": json.dumps([{"word": "games", "count": 3}]),
            },
        ]
    )
    result = _build_text_content_analysis(df)
    games = next(x for x in result["keyword_index"] if x["word"] == "games")
    assert games["total_count"] == 8
    assert games["page_count"] == 2
    assert len(games["top_pages"]) == 2
    assert result["vocabulary_stats"]["unique_terms"] == 2
    assert result["vocabulary_stats"]["pages_with_keywords"] == 2
    assert result["vocabulary_stats"]["total_term_occurrences"] == 10


def test_junk_terms_excluded() -> None:
    df = _df(
        [
            {
                "url": "https://example.com/page",
                "status": "200",
                "top_keywords": json.dumps(
                    [{"word": "h2 h3", "count": 10}, {"word": "video games", "count": 4}]
                ),
            }
        ]
    )
    result = _build_text_content_analysis(df)
    words = [x["word"] for x in result["keyword_index"]]
    assert "h2 h3" not in words
    assert "video games" in words


def test_histogram_buckets() -> None:
    df = _df(
        [
            {
                "url": "https://example.com/one",
                "status": "200",
                "top_keywords": json.dumps([{"word": "solo", "count": 1}]),
            },
            {
                "url": "https://example.com/two",
                "status": "200",
                "top_keywords": json.dumps([{"word": "shared", "count": 1}]),
            },
            {
                "url": "https://example.com/three",
                "status": "200",
                "top_keywords": json.dumps([{"word": "shared", "count": 1}]),
            },
        ]
    )
    result = _build_text_content_analysis(df)
    hist = result["keyword_frequency_histogram"]
    assert hist["1"] == 1  # solo on 1 page
    assert hist["2-5"] == 1  # shared on 2 pages


def test_empty_or_missing_column_returns_defaults() -> None:
    assert _build_text_content_analysis(pd.DataFrame())["keyword_index"] == []
    df = _df([{"url": "https://example.com", "status": "200", "word_count": 100}])
    result = _build_text_content_analysis(df)
    assert result["vocabulary_stats"]["unique_terms"] == 0
    assert result["keyword_index"] == []


def test_non_2xx_pages_skipped() -> None:
    df = _df(
        [
            {
                "url": "https://example.com/404",
                "status": "404",
                "top_keywords": json.dumps([{"word": "games", "count": 5}]),
            },
            {
                "url": "https://example.com/ok",
                "status": "200",
                "top_keywords": json.dumps([{"word": "games", "count": 2}]),
            },
        ]
    )
    result = _build_text_content_analysis(df)
    games = next(x for x in result["keyword_index"] if x["word"] == "games")
    assert games["total_count"] == 2
    assert games["page_count"] == 1
