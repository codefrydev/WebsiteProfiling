"""Tests for semantic text hygiene (structural token filtering)."""

from website_profiling.analysis.text import normalize_fingerprint_text
from website_profiling.analysis.text_hygiene import (
    filter_semantic_terms,
    filter_topic_clusters,
    is_junk_semantic_term,
)


def test_is_junk_semantic_term_heading_tags() -> None:
    assert is_junk_semantic_term("h2 h3") is True
    assert is_junk_semantic_term("h1") is True


def test_is_junk_semantic_term_empty_or_non_word() -> None:
    assert is_junk_semantic_term("") is True
    assert is_junk_semantic_term("   ") is True
    assert is_junk_semantic_term("!!!") is True


def test_is_junk_semantic_term_structural_multi_token() -> None:
    assert is_junk_semantic_term("div span") is True
    assert is_junk_semantic_term("html body") is True


def test_is_junk_semantic_term_real_words() -> None:
    assert is_junk_semantic_term("video games") is False
    assert is_junk_semantic_term("artificial intelligence") is False


def test_filter_topic_clusters_drops_junk() -> None:
    clusters = [
        {"top_keyword": "h3 h3", "keywords": ["h3 h3", "h3"]},
        {"top_keyword": "games", "keywords": ["games", "reviews"]},
    ]
    out = filter_topic_clusters(clusters)
    assert len(out) == 1
    assert out[0]["top_keyword"] == "games"


def test_normalize_fingerprint_text_excludes_heading_sequence_tags() -> None:
    import pandas as pd

    row = pd.Series(
        {
            "title": "Video Games",
            "h1": "Reviews",
            "meta_description": "Latest news",
            "heading_sequence": "h1,h2,h3,h3",
            "heading_text": "Top RPG picks | Indie highlights",
            "content_excerpt": "Body copy about games",
        }
    )
    out = normalize_fingerprint_text(row)
    assert "h2 h3" not in out
    assert "h3 h3" not in out
    assert "rpg picks" in out
    assert "video games" in out


def test_filter_semantic_terms() -> None:
    assert filter_semantic_terms(["h2 h3", "games", "reviews"]) == ["games", "reviews"]
