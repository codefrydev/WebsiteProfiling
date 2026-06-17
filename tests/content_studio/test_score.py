from __future__ import annotations

from website_profiling.content_studio.score import score_content_draft


def test_term_in_corpus_included() -> None:
    from website_profiling.content_studio.score import _term_in_corpus

    assert _term_in_corpus("crm software", "our crm software guide") == "included"


def test_term_in_corpus_partial() -> None:
    from website_profiling.content_studio.score import _term_in_corpus

    assert _term_in_corpus("sales pipeline", "building a pipeline for sales") == "partial"


def test_term_in_corpus_missing() -> None:
    from website_profiling.content_studio.score import _term_in_corpus

    assert _term_in_corpus("enterprise crm", "small business tips") == "missing"


def test_score_empty_body_low_grade() -> None:
    result = score_content_draft(
        None,
        "best crm",
        "",
        title_tag="",
        meta_description="",
        keyword_rows=[
            {"keyword": "best crm", "gsc_impressions": 500, "gsc_url": "https://ex.com/crm"},
            {"keyword": "crm software", "gsc_impressions": 200, "gsc_url": "https://ex.com/crm"},
        ],
    )
    assert 0 <= result["grade_score"] <= 100
    assert result["word_count"] == 0
    assert result["grade_label"] == "F"
    assert result["provenance"] == "Search Console + on-site heuristics"
    assert result["word_count_target"] > 0
    assert result["reading_level_target"] > 0
    kw_term = next(t for t in result["terms"] if t["term"] == "best crm")
    assert kw_term["count"] == 0
    assert kw_term["target"] >= 1


def test_score_rich_content_higher() -> None:
    body = """
    <h1>Best CRM for Startups</h1>
    <p>Choosing the best crm and crm software for your sales pipeline matters.
    This guide covers crm software options for startups.</p>
    """
    sparse = score_content_draft(
        None,
        "best crm",
        "<p>hi</p>",
        title_tag="Best CRM Guide",
        meta_description="A" * 130,
        keyword_rows=[{"keyword": "best crm", "gsc_impressions": 1000}],
    )
    rich = score_content_draft(
        None,
        "best crm",
        body,
        title_tag="Best CRM for Startups — Complete Guide",
        meta_description="A" * 130,
        keyword_rows=[
            {"keyword": "best crm", "gsc_impressions": 1000},
            {"keyword": "crm software", "gsc_impressions": 500},
            {"keyword": "sales pipeline", "gsc_impressions": 300},
        ],
    )
    assert rich["grade_score"] >= sparse["grade_score"]
    h1_check = next(c for c in rich["checks"] if c["id"] == "h1_single")
    assert h1_check["pass"] is True
    # Frequency: "crm software" appears twice in the rich body.
    crm_software = next(t for t in rich["terms"] if t["term"] == "crm software")
    assert crm_software["status"] == "included"
    assert crm_software["count"] == 2


def test_meta_title_checks() -> None:
    from website_profiling.content_studio.score import _meta_check, _title_check

    assert _title_check("")["pass"] is False
    assert _title_check("x" * 55)["pass"] is True
    assert _meta_check("x" * 140)["pass"] is True
    assert _meta_check("short")["pass"] is False


def test_grade_label_bounds() -> None:
    from website_profiling.content_studio.score import _grade_label

    assert _grade_label(100) == "A++"
    assert _grade_label(95) == "A+"
    assert _grade_label(90) == "A"
    assert _grade_label(88) == "A-"
    assert _grade_label(81) == "B"
    assert _grade_label(70) == "C"
    assert _grade_label(60) == "D"
    assert _grade_label(57) == "D-"
    assert _grade_label(40) == "F"


def test_term_in_corpus_empty_term() -> None:
    from website_profiling.content_studio.score import _term_in_corpus

    assert _term_in_corpus("", "some corpus") == "missing"
    assert _term_in_corpus("  ", "some corpus") == "missing"


def test_title_and_meta_length_edges() -> None:
    from website_profiling.content_studio.score import _meta_check, _title_check

    long_title = _title_check("x" * 75)
    assert long_title["pass"] is False
    assert "long" in long_title["hint"].lower()

    long_meta = _meta_check("x" * 180)
    assert long_meta["pass"] is False
    assert "long" in long_meta["hint"].lower()


def test_h1_multiple_fails() -> None:
    from website_profiling.content_studio.score import _h1_check

    result = _h1_check("<h1>A</h1><h1>B</h1>")
    assert result["pass"] is False
    assert "2" in result["hint"]


def test_word_count_check_edges() -> None:
    from website_profiling.content_studio.score import _word_count_band_score, _word_count_check

    thin = _word_count_check(100)
    assert thin["pass"] is False
    long_body = _word_count_check(3000)
    assert long_body["pass"] is False
    ok = _word_count_check(800)
    assert ok["pass"] is True
    assert _word_count_band_score(800) == 1.0
    assert _word_count_band_score(3000) < 1.0


def test_collect_gsc_terms_skips_invalid_rows() -> None:
    from website_profiling.content_studio.score import _collect_gsc_terms

    terms = _collect_gsc_terms(
        "best crm",
        "https://ex.com/crm",
        [
            "not-a-dict",
            {"keyword": "", "gsc_impressions": 50},
            {"keyword": "best crm software", "gsc_impressions": 200, "gsc_url": "https://ex.com/crm"},
        ],
    )
    assert any(t["term"] == "best crm" for t in terms)
    assert any(t["term"] == "best crm software" for t in terms)


def test_term_coverage_score_empty_and_partial() -> None:
    from website_profiling.content_studio.score import _checks_pass_rate, _term_coverage_score

    assert _term_coverage_score([]) == 0.5
    assert _checks_pass_rate([]) == 0.0
    partial = _term_coverage_score([
        {"importance": "high", "status": "partial"},
        {"importance": "medium", "status": "missing"},
    ])
    assert 0.0 < partial < 1.0


def test_score_loads_keyword_rows_from_db() -> None:
    from unittest.mock import MagicMock, patch

    rows = [{"keyword": "best crm", "gsc_impressions": 500, "gsc_url": "https://ex.com/crm"}]
    conn = MagicMock()
    with patch("website_profiling.content_studio.score.db_session") as mock_sess:
        mock_sess.return_value.__enter__.return_value = conn
        with patch(
            "website_profiling.content_studio.score.read_latest_keyword_data",
            return_value={"rows": rows},
        ):
            result = score_content_draft(
                1,
                "best crm",
                "<h1>Best CRM</h1><p>best crm overview</p>",
                title_tag="Best CRM Guide",
                meta_description="x" * 130,
            )
    assert any(t["term"] == "best crm" for t in result["terms"])


def test_term_in_corpus_no_substring_false_positive() -> None:
    """Word-boundary matching: a short term must not match inside a longer word."""
    from website_profiling.content_studio.score import _term_in_corpus

    assert _term_in_corpus("ai", "the brain explained this domain") == "missing"
    assert _term_in_corpus("ai", "the best ai tools available") == "included"


def test_term_match_counts_occurrences() -> None:
    from website_profiling.content_studio.score import _match_tokens, _term_match

    tokens = _match_tokens("crm software is the best crm software for teams")
    status, count = _term_match("crm software", tokens, set(tokens))
    assert status == "included"
    assert count == 2


def test_phrase_count_edges() -> None:
    from website_profiling.content_studio.score import _phrase_count

    assert _phrase_count([], ["a", "b"]) == 0
    assert _phrase_count(["a", "b", "c"], ["a"]) == 0
    assert _phrase_count(["a", "a"], ["a", "a", "a"]) == 1  # non-overlapping


def test_term_target_scales_with_importance_and_length() -> None:
    from website_profiling.content_studio.score import _term_target

    assert _term_target("crm", "high") == 3
    assert _term_target("crm", "medium") == 2
    assert _term_target("best crm software guide", "high") == 1  # long phrase


def test_keyword_present_phrase_words_and_fallback() -> None:
    from website_profiling.content_studio.score import _keyword_present

    assert _keyword_present("best crm", "the best crm tool") is True  # phrase
    assert _keyword_present("best crm", "crm picks ranked from best to worst") is True  # words
    assert _keyword_present("best crm", "spreadsheet tips") is False
    assert _keyword_present("", "anything") is False
    assert _keyword_present("to by", "go to and come by") is True  # stopword fallback


def test_keyword_placement_checks() -> None:
    from website_profiling.content_studio.score import (
        _keyword_in_h1_check,
        _keyword_in_intro_check,
        _keyword_in_title_check,
    )

    assert _keyword_in_title_check("best crm", "Best CRM Guide")["pass"] is True
    assert _keyword_in_title_check("best crm", "Spreadsheet Guide")["pass"] is False
    assert _keyword_in_h1_check("best crm", "<h1>Best CRM</h1>")["pass"] is True
    assert _keyword_in_h1_check("best crm", "<p>no heading</p>")["pass"] is False
    assert _keyword_in_intro_check("best crm", "The best crm options today.")["pass"] is True
    assert _keyword_in_intro_check("best crm", "")["pass"] is False
    assert _keyword_in_intro_check("best crm", "Spreadsheets are fine.")["pass"] is False


def test_first_h1_text() -> None:
    from website_profiling.content_studio.score import _first_h1_text

    assert _first_h1_text("") == ""
    assert _first_h1_text("<h1>Hello World</h1>") == "Hello World"
    assert _first_h1_text("<p>no heading here</p>") == ""


def test_reading_level_check_branches() -> None:
    from website_profiling.content_studio.score import _reading_level_check

    assert _reading_level_check(9.0, 20)["pass"] is False  # too short
    assert _reading_level_check(15.0, 500)["pass"] is False  # too complex
    assert _reading_level_check(9.0, 500)["pass"] is True


def test_term_coverage_frequency_aware() -> None:
    from website_profiling.content_studio.score import _term_coverage_score

    # Below target earns a fraction; at/above target earns full credit.
    below = _term_coverage_score([{"importance": "high", "status": "included", "count": 1, "target": 3}])
    full = _term_coverage_score([{"importance": "high", "status": "included", "count": 3, "target": 3}])
    missing = _term_coverage_score([{"importance": "high", "status": "missing", "count": 0, "target": 3}])
    assert below == 1 / 3
    assert full == 1.0
    assert missing == 0.0


def test_score_db_returns_non_list_rows() -> None:
    from unittest.mock import MagicMock, patch

    conn = MagicMock()
    with patch("website_profiling.content_studio.score.db_session") as mock_sess:
        mock_sess.return_value.__enter__.return_value = conn
        with patch(
            "website_profiling.content_studio.score.read_latest_keyword_data",
            return_value={"rows": "bad"},
        ):
            result = score_content_draft(1, "best crm", "<p>best crm</p>")
    assert result["terms"]
