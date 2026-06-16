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
    assert result["grade_label"] in ("A", "B", "C", "D", "F")
    assert result["provenance"] == "Search Console + on-site heuristics"
    assert any(t["term"] == "best crm" for t in result["terms"])


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
    assert rich["checks"][2]["id"] == "h1_single"
    assert rich["checks"][2]["pass"] is True


def test_meta_title_checks() -> None:
    from website_profiling.content_studio.score import _meta_check, _title_check

    assert _title_check("")["pass"] is False
    assert _title_check("x" * 55)["pass"] is True
    assert _meta_check("x" * 140)["pass"] is True
    assert _meta_check("short")["pass"] is False


def test_grade_label_bounds() -> None:
    from website_profiling.content_studio.score import _grade_label

    assert _grade_label(95) == "A"
    assert _grade_label(85) == "B"
    assert _grade_label(75) == "C"
    assert _grade_label(65) == "D"
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
