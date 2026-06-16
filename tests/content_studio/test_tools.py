"""Tests for Content Studio deterministic analyze tools."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.content_studio.context import ContentStudioContext
from website_profiling.content_studio.tools import (
    REQUIRED_CONTENT_STUDIO_TOOLS,
    dispatch_content_studio_tool,
    run_all_content_studio_tools,
    tool_get_keyword_gsc_context,
    tool_get_term_coverage,
)


def test_content_studio_tools_return_structured_data() -> None:
    ctx = ContentStudioContext(
        property_id=None,
        keyword="best crm",
        body_html="<h1>Best CRM Guide</h1><p>Our best crm overview.</p>",
        title_tag="Best CRM Guide",
        meta_description="x" * 130,
        title="Draft title",
    )
    score = dispatch_content_studio_tool("get_draft_seo_score", ctx)
    terms = dispatch_content_studio_tool("get_term_coverage", ctx)
    structure = dispatch_content_studio_tool("get_draft_structure", ctx)

    assert "grade_score" in score
    assert terms["target_keyword"] == "best crm"
    assert structure["headings"][0]["level"] == "h1"
    assert len(run_all_content_studio_tools(ctx)) == len(REQUIRED_CONTENT_STUDIO_TOOLS)


def test_content_studio_tools_edge_cases() -> None:
    empty_kw = tool_get_keyword_gsc_context(
        ContentStudioContext(property_id=None, keyword="", body_html="<p>x</p>")
    )
    assert empty_kw["queries"] == []

    unknown = dispatch_content_studio_tool("missing_tool", ContentStudioContext(
        property_id=None, keyword="x", body_html="<p>x</p>",
    ))
    assert "unknown tool" in unknown["error"]

    with patch(
        "website_profiling.content_studio.tools.score_content_draft",
        side_effect=RuntimeError("score failed"),
    ):
        err = dispatch_content_studio_tool(
            "get_draft_seo_score",
            ContentStudioContext(property_id=None, keyword="x", body_html="<p>x</p>"),
        )
    assert err["error"] == "score failed"

    many_headings = "".join(f"<h2>Section {i}</h2>" for i in range(20))
    structure = dispatch_content_studio_tool(
        "get_draft_structure",
        ContentStudioContext(property_id=None, keyword="x", body_html=many_headings),
    )
    assert len(structure["headings"]) <= 12

    with patch("website_profiling.content_studio.tools.score_content_draft") as mock_score:
        mock_score.return_value = {
            "terms": ["bad", {"term": "crm", "status": "missing"}],
            "checks": [],
        }
        terms = tool_get_term_coverage(
            ContentStudioContext(property_id=None, keyword="crm", body_html="<p>x</p>"),
        )
    assert "crm" in terms["missing"]

    rows = [
        {"keyword": "best crm", "gsc_impressions": 100, "gsc_url": "https://ex.com/crm"},
        {"keyword": "", "gsc_impressions": 10, "gsc_url": "https://ex.com/crm"},
        {"keyword": "unrelated", "gsc_impressions": 50, "gsc_url": "https://ex.com/other"},
    ]
    conn = MagicMock()
    with patch("website_profiling.content_studio.tools.db_session") as mock_sess:
        mock_sess.return_value.__enter__.return_value = conn
        with patch(
            "website_profiling.content_studio.tools.read_latest_keyword_data",
            return_value={"rows": rows},
        ):
            gsc = tool_get_keyword_gsc_context(ContentStudioContext(
                property_id=1,
                keyword="best crm",
                body_html="<p>x</p>",
                landing_url="https://ex.com/crm",
            ))
    assert gsc["total_related"] == 1
    assert gsc["queries"][0]["keyword"] == "best crm"

    with patch("website_profiling.content_studio.tools.db_session") as mock_sess:
        mock_sess.return_value.__enter__.side_effect = RuntimeError("db down")
        gsc_err = tool_get_keyword_gsc_context(ContentStudioContext(
            property_id=1, keyword="best crm", body_html="<p>x</p>",
        ))
    assert gsc_err["queries"] == []

    empty_structure = dispatch_content_studio_tool(
        "get_draft_structure",
        ContentStudioContext(property_id=None, keyword="x", body_html=""),
    )
    assert empty_structure["headings"] == []
