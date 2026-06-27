"""Tests for dynamic chat tool selection."""
from __future__ import annotations

import os
from unittest.mock import patch

from website_profiling.tools.audit_tools.registry import mcp_tool_names, tier0_tool_names, tool_handler_names
from website_profiling.tools.audit_tools.tool_selector import (
    chat_tool_max,
    chat_tool_search_cap,
    expand_active_tools_from_result,
    select_tools_for_turn,
)


def test_select_tools_always_includes_tier0() -> None:
    names = select_tools_for_turn("hello")
    assert tier0_tool_names() <= names
    assert len(names) <= chat_tool_max()


def test_select_tools_google_domain_boost() -> None:
    names = select_tools_for_turn("Show me GSC clicks and GA4 landing pages")
    assert "get_google_summary" in names or "get_gsc_top_queries" in names


def test_select_tools_full_mode() -> None:
    with patch.dict(os.environ, {"CHAT_TOOL_MODE": "full"}):
        names = select_tools_for_turn("anything")
    assert names == tool_handler_names()


def test_select_tools_broken_links_in_subset() -> None:
    names = select_tools_for_turn("list broken internal links")
    assert "list_broken_links" in names


def test_broken_link_tools_classified_as_links() -> None:
    from website_profiling.tools.audit_tools.tool_domains import classify_tool_domain

    assert classify_tool_domain("list_broken_links") == "links"
    assert classify_tool_domain("list_broken_link_sources") == "links"


def test_mcp_core_includes_tier0_tools() -> None:
    core = mcp_tool_names("core")
    assert tier0_tool_names() <= core


def test_compare_tools_classified_as_drift() -> None:
    from website_profiling.tools.audit_tools.tool_domains import classify_tool_domain

    assert classify_tool_domain("compare_issue_deltas") == "drift"
    assert classify_tool_domain("compare_reports") == "drift"


def test_audit_report_overview_prefers_portfolio_not_export() -> None:
    names = select_tools_for_turn("show me the audit report overview")
    assert "get_report_summary" in names
    assert "export_audit_report" not in names


def test_compare_prompt_loads_compare_issue_deltas() -> None:
    names = select_tools_for_turn("compare issue deltas since last crawl")
    assert "compare_issue_deltas" in names


def test_playbook_anchors_load_specialized_tools() -> None:
    assert "get_image_audit_summary" in select_tools_for_turn("image alt audit")
    assert "export_audit_report" in select_tools_for_turn("export as pdf")
    assert "get_category_scores" in select_tools_for_turn("show category scores")
    assert "get_critical_issues" in select_tools_for_turn("top critical issues")
    assert "get_lighthouse_summary" in select_tools_for_turn("lighthouse scores")


def test_catalog_does_not_match_ops_domain() -> None:
    from website_profiling.tools.audit_tools.tool_selector import _score_domains

    assert _score_domains("show catalog") == []


def test_search_expansion_applies_soft_cap() -> None:
    active = tier0_tool_names()
    many = [f"tool_{i}" for i in range(100)]
    expanded = expand_active_tools_from_result(
        "search_audit_tools",
        {"tool_names": many},
        active,
    )
    assert len(expanded) <= chat_tool_search_cap()


def test_search_audit_tools_expansion_names() -> None:
    active = tier0_tool_names()
    expanded = expand_active_tools_from_result(
        "search_audit_tools",
        {"tool_names": ["list_broken_links", "get_schema_coverage"]},
        active,
    )
    assert "list_broken_links" in expanded
    assert "get_schema_coverage" in expanded


def test_domain_agent_expansion_names() -> None:
    active = tier0_tool_names()
    expanded = expand_active_tools_from_result(
        "run_domain_agent",
        {"tools_used": ["get_lighthouse_summary", "list_broken_links"]},
        active,
    )
    assert "get_lighthouse_summary" in expanded
    assert "list_broken_links" in expanded
