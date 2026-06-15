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
