from __future__ import annotations

from website_profiling.content_studio.ai_suggest import _rule_suggestions, analyze_content_draft
from website_profiling.content_studio.context import ContentStudioContext
from website_profiling.content_studio.tools import (
    REQUIRED_CONTENT_STUDIO_TOOLS,
    dispatch_content_studio_tool,
    run_all_content_studio_tools,
)


def test_rule_suggestions_missing_terms_and_checks() -> None:
    score = {
        "terms": [
            {"term": "best crm", "status": "missing", "importance": "high"},
            {"term": "crm software", "status": "partial", "importance": "medium"},
            {"term": "sales pipeline", "status": "included", "importance": "medium"},
        ],
        "checks": [
            {"id": "title", "pass": False, "hint": "Add a title tag between 30–60 characters."},
            {"id": "meta", "pass": True, "hint": "Meta description length is good."},
        ],
        "word_count": 120,
    }
    items = _rule_suggestions(score)
    texts = [i["text"] for i in items]
    assert any("best crm" in t for t in texts)
    assert any("crm software" in t for t in texts)
    assert any("title tag" in t.lower() for t in texts)
    assert all(i["source"] == "rule" for i in items)


def test_analyze_without_ai_runs_all_tools() -> None:
    result = analyze_content_draft(
        None,
        "best crm",
        "<h1>Best CRM</h1><p>Short draft.</p>",
        title_tag="",
        meta_description="",
        use_ai=False,
    )
    assert result["ok"] is True
    assert result["ai_used"] is False
    assert len(result["tools_used"]) == len(REQUIRED_CONTENT_STUDIO_TOOLS)
    assert len(result["tool_events"]) == len(REQUIRED_CONTENT_STUDIO_TOOLS)
    assert "Rule-based" in result["provenance"]


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
