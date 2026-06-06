from __future__ import annotations

import math

import pandas as pd
import pytest


def test_top_keywords_as_text_missing_column() -> None:
    from website_profiling.analysis.text import top_keywords_as_text

    row = pd.Series({"title": "x"})
    assert top_keywords_as_text(row) == ""


def test_top_keywords_as_text_none_nan_empty() -> None:
    from website_profiling.analysis.text import top_keywords_as_text

    assert top_keywords_as_text(pd.Series({"top_keywords": None})) == ""
    assert top_keywords_as_text(pd.Series({"top_keywords": float("nan")})) == ""
    assert top_keywords_as_text(pd.Series({"top_keywords": "[]"})) == ""
    assert top_keywords_as_text(pd.Series({"top_keywords": "  "})) == ""


def test_top_keywords_as_text_invalid_json() -> None:
    from website_profiling.analysis.text import top_keywords_as_text

    assert top_keywords_as_text(pd.Series({"top_keywords": "not-json"})) == ""


def test_top_keywords_as_text_non_list() -> None:
    from website_profiling.analysis.text import top_keywords_as_text

    assert top_keywords_as_text(pd.Series({"top_keywords": '{"word": "a"}'})) == ""


def test_top_keywords_as_text_skips_items_without_word() -> None:
    from website_profiling.analysis.text import top_keywords_as_text

    row = pd.Series({"top_keywords": '[{"word": "seo"}, {"nope": 1}, "x"]'})
    assert top_keywords_as_text(row) == "seo"


def test_top_keywords_as_text_respects_max_terms() -> None:
    from website_profiling.analysis.text import top_keywords_as_text

    items = [{"word": f"w{i}"} for i in range(20)]
    import json

    row = pd.Series({"top_keywords": json.dumps(items)})
    assert top_keywords_as_text(row, max_terms=3) == "w0 w1 w2"


def test_normalize_fingerprint_text_concatenates_columns() -> None:
    from website_profiling.analysis.text import normalize_fingerprint_text

    row = pd.Series(
        {
            "title": "  Hello World  ",
            "h1": "H1",
            "meta_description": None,
            "heading_sequence": float("nan"),
            "og_title": "",
            "og_description": "OG",
            "twitter_title": "Tw",
            "content_excerpt": "Body text",
            "top_keywords": '[{"word": "kw1"}]',
        }
    )
    out = normalize_fingerprint_text(row)
    assert "hello world" in out
    assert "h1" in out
    assert "og" in out
    assert "kw1" in out
    assert "  " not in out


def test_normalize_fingerprint_text_truncates() -> None:
    from website_profiling.analysis.text import normalize_fingerprint_text

    row = pd.Series({"title": "x" * 15000})
    assert len(normalize_fingerprint_text(row)) == 12000


def test_normalize_fingerprint_text_skips_missing_columns() -> None:
    from website_profiling.analysis.text import normalize_fingerprint_text

    assert normalize_fingerprint_text(pd.Series(dtype=object)) == ""
