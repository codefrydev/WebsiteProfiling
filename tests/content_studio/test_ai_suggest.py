"""Tests for Content Studio analyze suggestions and AI orchestration."""
from __future__ import annotations

import re
from unittest.mock import patch

from website_profiling.content_studio.ai_suggest import (
    _cfg_content_studio_ai,
    _merge_suggestions,
    _rule_suggestions,
    analyze_content_draft,
)
from website_profiling.content_studio.tools import REQUIRED_CONTENT_STUDIO_TOOLS


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


def test_rule_suggestions_under_target_high_term() -> None:
    score = {
        "terms": [
            {"term": "best crm", "status": "included", "importance": "high", "count": 1, "target": 3},
            {"term": "crm software", "status": "included", "importance": "high", "count": 3, "target": 3},
            {"term": "sales pipeline", "status": "included", "importance": "medium", "count": 1, "target": 2},
        ],
        "checks": [],
        "word_count": 800,
    }
    items = _rule_suggestions(score)
    texts = [i["text"] for i in items]
    # Only the under-target high-importance term gets a "use it more" tip.
    assert any("best crm" in t and "more time" in t for t in texts)
    assert not any("crm software" in t for t in texts)
    assert not any("sales pipeline" in t for t in texts)


def test_rule_suggestions_skips_non_dict_terms() -> None:
    score = {
        "terms": ["bad", {"term": "crm", "status": "missing", "importance": "high"}],
        "checks": [],
        "word_count": 500,
    }
    items = _rule_suggestions(score)
    assert len(items) == 1
    assert "crm" in items[0]["text"]


def test_merge_suggestions_dedupes_and_normalizes() -> None:
    merged = _merge_suggestions(
        [{"text": "Fix title", "priority": "high", "type": "seo", "source": "rule"}],
        [
            {"text": "  fix   title ", "priority": "low", "type": "seo"},
            "not-a-dict",
            {"text": "", "priority": "low"},
            {"text": "Add keyword", "priority": "medium", "type": "term"},
        ],
    )
    assert len(merged) == 2
    normalized = {re.sub(r"\s+", " ", m["text"].strip().lower()) for m in merged}
    assert normalized == {"fix title", "add keyword"}


def test_cfg_content_studio_ai_toggle() -> None:
    assert _cfg_content_studio_ai({"llm_enable_content_studio": "true"}) is True
    assert _cfg_content_studio_ai({"llm_enable_content_studio": "0"}) is False


def test_analyze_with_ai_disabled_in_settings() -> None:
    cfg = {"llm_enabled": True, "llm_provider": "openai", "llm_enable_content_studio": "false"}
    with patch("website_profiling.content_studio.ai_suggest.load_llm_config_from_db", return_value=cfg):
        result = analyze_content_draft(
            None,
            "best crm",
            "<h1>Best CRM</h1><p>best crm</p>",
            use_ai=True,
        )
    assert result["ai_used"] is False
    assert result["ai_error"] == "AI insights disabled in settings."


def test_analyze_with_ai_llm_disabled() -> None:
    with patch(
        "website_profiling.content_studio.ai_suggest.load_llm_config_from_db",
        return_value={"llm_enabled": False, "llm_provider": "none"},
    ):
        result = analyze_content_draft(None, "best crm", "<p>best crm</p>", use_ai=True)
    assert result["ai_used"] is False
    assert "AI off" in result["provenance"]


def test_analyze_with_ai_uses_cache() -> None:
    cached = {
        "ai_block": {
            "summary": "Cached summary",
            "suggestions": [{"text": "Cached tip", "priority": "high", "type": "seo"}],
            "outline": ["H2 idea"],
            "title_ideas": ["Title A"],
        },
        "tool_events": [{"name": "get_draft_seo_score", "args": {}, "result": {}}],
    }
    cfg = {"llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test"}
    with patch("website_profiling.content_studio.ai_suggest.load_llm_config_from_db", return_value=cfg), patch(
        "website_profiling.content_studio.ai_suggest._read_cache",
        return_value=cached,
    ), patch("website_profiling.content_studio.ai_suggest.call_ai_api") as mock_agent:
        result = analyze_content_draft(None, "best crm", "<p>best crm</p>", use_ai=True)
    mock_agent.assert_not_called()
    assert result["ai_used"] is True
    assert result["summary"] == "Cached summary"
    assert result["outline"] == ["H2 idea"]
    assert result["title_ideas"] == ["Title A"]
    assert any(s["source"] == "ai" for s in result["suggestions"])


def test_analyze_with_ai_agent_success() -> None:
    cfg = {"llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test"}
    agent_payload = {
        "ok": True,
        "ai_block": {
            "summary": "Agent summary",
            "suggestions": [{"text": "Agent tip", "priority": "medium", "type": "structure"}],
            "outline": ["Section"],
            "title_ideas": ["Better title"],
        },
        "tool_events": [{"name": "get_draft_seo_score", "args": {}, "result": {"grade_score": 50}}],
    }
    with patch("website_profiling.content_studio.ai_suggest.load_llm_config_from_db", return_value=cfg), patch(
        "website_profiling.content_studio.ai_suggest._read_cache",
        return_value=None,
    ), patch(
        "website_profiling.content_studio.ai_suggest.call_ai_api",
        return_value=agent_payload,
    ), patch("website_profiling.content_studio.ai_suggest._write_cache") as mock_write:
        result = analyze_content_draft(
            None,
            "best crm",
            "<h1>Best CRM</h1><p>short</p>",
            title_tag="",
            use_ai=True,
            refresh=True,
        )
    mock_write.assert_called_once()
    assert result["ai_used"] is True
    assert result["summary"] == "Agent summary"
    assert result["tools_used"] == ["get_draft_seo_score"]


def test_analyze_with_ai_agent_failure() -> None:
    cfg = {"llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test"}
    with patch("website_profiling.content_studio.ai_suggest.load_llm_config_from_db", return_value=cfg), patch(
        "website_profiling.content_studio.ai_suggest._read_cache",
        return_value=None,
    ), patch(
        "website_profiling.content_studio.ai_suggest.call_ai_api",
        return_value={"ok": False, "error": "model timeout", "tool_events": []},
    ):
        result = analyze_content_draft(None, "best crm", "<p>best crm</p>", use_ai=True, refresh=True)
    assert result["ai_used"] is False
    assert result["ai_error"] == "model timeout"
    assert "AI failed" in result["provenance"]


def test_analyze_with_ai_empty_block() -> None:
    cfg = {"llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test"}
    with patch("website_profiling.content_studio.ai_suggest.load_llm_config_from_db", return_value=cfg), patch(
        "website_profiling.content_studio.ai_suggest._read_cache",
        return_value=None,
    ), patch(
        "website_profiling.content_studio.ai_suggest.call_ai_api",
        return_value={"ok": True, "ai_block": {}, "tool_events": []},
    ):
        result = analyze_content_draft(None, "best crm", "<p>best crm</p>", use_ai=True, refresh=True)
    assert result["ai_error"] == "No structured output from analyze agent."
