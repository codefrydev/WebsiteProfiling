"""Tests for on-site keyword candidate extraction."""

import json

import pandas as pd

from website_profiling.analysis.text_hygiene import is_junk_semantic_term
from website_profiling.tools.keywords import extract_candidates_from_df, score_keywords


def test_is_junk_semantic_term_rejects_heading_tag_ngrams() -> None:
    assert is_junk_semantic_term("h2 h3") is True
    assert is_junk_semantic_term("h3 h3 h3 h3") is True
    assert is_junk_semantic_term("h1") is True


def test_is_junk_semantic_term_accepts_real_terms() -> None:
    assert is_junk_semantic_term("video games") is False
    assert is_junk_semantic_term("artificial intelligence") is False
    assert is_junk_semantic_term("games") is False


def test_extract_candidates_ignores_heading_sequence_tag_names() -> None:
    df = pd.DataFrame(
        [
            {
                "url": "https://example.com/page",
                "status": "200",
                "title": "Video Games Reviews",
                "meta_description": "Latest video games news",
                "h1": "Video Games",
                "heading_sequence": "h1,h2,h3,h3",
                "heading_text": "Best RPG Games | Indie Reviews",
                "top_keywords": json.dumps(
                    [{"word": "games", "count": 12}, {"word": "reviews", "count": 8}]
                ),
            }
        ]
    )
    candidates = extract_candidates_from_df(df)
    assert "h2 h3" not in candidates
    assert "h3 h3" not in candidates
    assert "games" in candidates
    assert "video games" in candidates
    assert "rpg games" in candidates
    assert candidates["games"]["count"] >= 12


def test_score_keywords_skips_junk_candidates() -> None:
    candidates = {
        "h2 h3": {"sources": ["https://a.com"], "tokens": ["h2", "h3"], "count": 5},
        "video games": {"sources": ["https://a.com"], "tokens": ["video", "games"], "count": 3},
    }
    scored = score_keywords(candidates, corpus_size=1)
    keywords = [row["keyword"] for row in scored]
    assert "h2 h3" not in keywords
    assert "video games" in keywords
