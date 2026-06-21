"""Coverage for batch-100 foundation modules (data_coverage, insight, router, registry)."""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from website_profiling.tools.audit_tools.insight import insight_helpers as ih
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.audit_tools import (registry)
from website_profiling.tools.audit_tools.crawl import crawl as crawl_mod
from website_profiling.tools.audit_tools.core import data_coverage as dc_mod
from website_profiling.tools.audit_tools.google import google as google_mod
from website_profiling.tools.audit_tools.insight import insight_tools as insight_mod
from website_profiling.tools.audit_tools.keywords import keywords as kw_mod
from website_profiling.tools.audit_tools.core import router_tools as router_mod
from website_profiling.tools.audit_tools.tool_domains import (
    CANONICAL_DOMAINS,
    CHAT_ONLY_TOOLS,
    TIER_0_TOOLS,
    classify_tool_domain,
    domains_catalog,
    tool_names_for_mcp_bundle,
    tool_names_for_tier,
    tools_by_domain,
)
from website_profiling.tools.audit_tools.tool_selector import (
    apply_tool_cap,
    chat_tool_max,
    compact_tool_list,
    select_tools_for_turn,
)


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


@pytest.fixture
def ctx() -> Ctx:
    return Ctx(property_id=1, report_id=1)


def test_context_load_google_full_and_pair_fallbacks(conn: MagicMock, ctx: Ctx) -> None:
    embedded = {"gsc": {"summary": {"clicks": 1}}, "fetched_at": "2026-01-01"}
    prior = {"gsc_full": {"summary": {"clicks": 0}}}

    with patch(
        "website_profiling.tools.audit_tools.context.read_google_data_full",
        return_value=None,
    ), patch(
        "website_profiling.tools.audit_tools.context.read_report_payload",
        return_value={"google": embedded},
    ):
        assert ctx.load_google_full(conn) == embedded

    with patch(
        "website_profiling.tools.audit_tools.context.read_google_data_full",
        return_value=None,
    ), patch(
        "website_profiling.tools.audit_tools.context.read_prior_google_snapshot",
        return_value=prior,
    ), patch(
        "website_profiling.tools.audit_tools.context.read_report_payload",
        return_value={"google": embedded},
    ):
        current, prior_out = ctx.load_google_pair(conn)
        assert current == embedded
        assert prior_out == prior

    with patch(
        "website_profiling.tools.audit_tools.context.read_google_data_full",
        return_value={"gsc_full": {"summary": {}}},
    ):
        assert ctx.load_google_full(conn) == {"gsc_full": {"summary": {}}}


def test_data_coverage_report_all_branches(conn: MagicMock, ctx: Ctx) -> None:
    assert dc_mod.get_data_coverage_report(conn, Ctx(property_id=None), {})["error"]

    with patch("website_profiling.tools.audit_tools.core.data_coverage.get_property_by_id", return_value=None):
        assert dc_mod.get_data_coverage_report(conn, ctx, {})["error"] == "property not found"

    prop = {"google_refresh_token": "tok"}
    payload = {
        "image_inventory": [{"url": "x"}],
        "axe_audit_summary": {"violations": 1},
        "rich_results_validation": {"ok": True},
        "text_content_analysis": {"words": 100},
        "semantic_keyword_clusters": [{"k": "a"}],
        "log_analysis": {"paths": []},
    }
    google = {
        "gsc": {"summary": {"clicks": 10}},
        "ga4": {"summary": {"sessions": 20}},
    }
    keywords = {"rows": [{"keyword": "a"}], "fetched_at": "2026-01-01"}
    gsc_links = {
        "sample_links": [{"url": "x"}],
        "third_party_overlays": [{"source": "moz"}],
    }
    google_full = {"gsc_full": {"summary": {}}, "ga4_full": {"summary": {}}}

    with patch("website_profiling.tools.audit_tools.core.data_coverage.get_property_by_id", return_value=prop), patch.object(
        Ctx, "load_payload", return_value=payload,
    ), patch.object(Ctx, "load_google", return_value=google), patch.object(
        Ctx, "load_keywords", return_value=keywords,
    ), patch.object(Ctx, "load_gsc_links", return_value=gsc_links), patch.object(
        Ctx, "load_google_full", return_value=google_full,
    ), patch(
        "website_profiling.integrations.google.store.read_prior_google_snapshot",
        return_value={"gsc": {}},
    ):
        result = dc_mod.get_data_coverage_report(conn, ctx, {})
    assert result["missing_count"] == 0
    assert len(result["checks"]) >= 10

    sparse_prop = {"id": 1}
    with patch("website_profiling.tools.audit_tools.core.data_coverage.get_property_by_id", return_value=sparse_prop), patch.object(
        Ctx, "load_payload", return_value={},
    ), patch.object(Ctx, "load_google", return_value=None), patch.object(
        Ctx, "load_keywords", return_value=None,
    ), patch.object(Ctx, "load_gsc_links", return_value=None), patch.object(
        Ctx, "load_google_full", return_value=None,
    ), patch(
        "website_profiling.integrations.google.store.read_prior_google_snapshot",
        return_value=None,
    ):
        sparse = dc_mod.get_data_coverage_report(conn, ctx, {})
    assert sparse["missing_count"] > 0
    assert sparse["checks"][0]["config_hint"]


def test_google_series_and_page_queries(conn: MagicMock, ctx: Ctx) -> None:
    assert google_mod.get_gsc_daily_trend(conn, ctx, {})["missing"]
    assert google_mod.get_ga4_daily_trend(conn, ctx, {})["missing"]
    assert google_mod.get_ga4_by_device(conn, ctx, {})["missing"]
    assert google_mod.get_ga4_by_channel(conn, ctx, {})["missing"]
    assert google_mod.get_gsc_page_queries(conn, ctx, {})["error"] == "url is required"
    with patch.object(Ctx, "load_google_full", return_value=None), patch.object(Ctx, "load_google", return_value=None):
        assert google_mod.get_gsc_page_queries(conn, ctx, {"url": "https://ex.com/"})["missing"]

    raw = {
        "gsc_full": {
            "by_page": {
                "https://ex.com/": {
                    "queries": [{"query": "q1", "clicks": 1}],
                },
            },
        },
        "fetched_at": "2026-01-01",
    }
    with patch.object(Ctx, "load_google_full", return_value=raw):
        ok = google_mod.get_gsc_page_queries(conn, ctx, {"url": "https://ex.com/"})
    assert ok["total"] == 1

    google_data = {
        "gsc": {"daily": [{"date": "2026-01-01", "clicks": 1}]},
        "ga4": {"daily": [], "by_device": [{"device": "mobile"}], "by_channel": [{"channel": "organic"}]},
        "fetched_at": "2026-01-01",
        "date_range": "28d",
    }
    with patch.object(Ctx, "load_google", return_value=google_data):
        assert google_mod.get_gsc_daily_trend(conn, ctx, {})["provenance"] == "Search Console"
        assert google_mod.get_ga4_daily_trend(conn, ctx, {})["provenance"] == "Google Analytics 4"
        assert google_mod.get_ga4_by_device(conn, ctx, {})["by_device"]
        assert google_mod.get_ga4_by_channel(conn, ctx, {})["by_channel"]


def test_insight_helpers_all_branches() -> None:
    assert ih._num("bad", 5.0) == 5.0
    assert ih.classify_opportunity_quadrant(
        {"position": 10, "impressions": 200}, {"sessions": 20, "engagementRate": 0.6},
    ) == "high_impact"
    assert ih.classify_opportunity_quadrant(
        {"position": 10, "impressions": 200}, {"sessions": 0, "engagementRate": 0.1},
    ) == "worth_optimizing"
    assert ih.classify_opportunity_quadrant(
        {"position": 1, "impressions": 10}, {"sessions": 100, "engagementRate": 0.9},
    ) == "good_but_capped"
    assert ih.classify_opportunity_quadrant({"position": 1, "impressions": 1}, None) == "low_priority"

    assert ih.traffic_health_ratio({}, {})["diagnosis"] == "no_data"
    low = ih.traffic_health_ratio({"clicks": 100}, {"sessions": 10})
    assert low["diagnosis"] == "tracking_gap"
    high = ih.traffic_health_ratio({"clicks": 10}, {"sessions": 100})
    assert high["diagnosis"] == "filter_issue"

    gsc_pages = {
        "https://ex.com/a": {"impressions": 500, "clicks": 10, "position": 8, "ctr": 0.02},
        "https://ex.com/skip": "not-a-dict",
        "https://ex.com/low": {"impressions": 5, "clicks": 0, "position": 50, "ctr": 0.001},
    }
    ga4_paths = {
        "/a": {"full_url": "https://ex.com/a", "sessions": 15, "engagementRate": 0.55},
        "/by-path": {"sessions": 8, "engagementRate": 0.4},
        "bad": "skip",
    }
    rows = ih.blend_landing_pages(gsc_pages, ga4_paths, limit=5, min_impressions=100)
    assert rows[0]["quadrant"] == "high_impact"
    assert rows[0]["ga4_sessions"] == 15
    path_match = ih.blend_landing_pages(
        {"https://ex.com/by-path": {"impressions": 200, "clicks": 1, "position": 15, "ctr": 0.01}},
        ga4_paths,
        limit=5,
        min_impressions=0,
    )
    assert path_match[0]["ga4_sessions"] == 8

    payload = {
        "categories": [
            "bad",
            {
                "id": "onpage",
                "issues": [
                    {"url": "https://ex.com/page", "priority": "High", "message": "missing title"},
                    {"url": "https://other.com", "priority": "Low", "message": "skip"},
                    "bad-issue",
                    {"priority": "Medium", "message": "site-wide"},
                ],
            },
        ],
    }
    flags = ih.page_issue_flags("https://ex.com/page", payload)
    assert flags[0]["message"] == "missing title"
    assert any(f.get("message") == "site-wide" for f in flags)

    green = ih.composite_page_score(
        {"position": 5},
        {"engagementRate": 0.8},
        {"position": 10},
        {"engagementRate": 0.5},
        [],
        {"performance": 90, "seo": 95},
    )
    assert green["band"] == "green"

    amber = ih.composite_page_score(
        {"position": 20},
        {"engagementRate": 0.5},
        {"position": 10},
        {"engagementRate": 0.5},
        [{"priority": "High"}],
        None,
    )
    assert amber["band"] == "amber"

    red = ih.composite_page_score(
        {"position": 30},
        {"engagementRate": 0.1},
        {"position": 10},
        {"engagementRate": 0.5},
        [{"priority": "Critical"}, {"priority": "Critical"}],
        {"performance": 30, "seo": 50},
    )
    assert red["band"] == "red"


def test_insight_tools_dispatch(conn: MagicMock, ctx: Ctx) -> None:
    assert insight_mod.get_landing_page_blended_table(conn, ctx, {})["missing"]

    google_full = {
        "gsc_full": {
            "by_page": {"https://ex.com/": {"impressions": 500, "clicks": 5, "position": 12, "ctr": 0.01}},
            "top_pages": [{"page": "https://ex.com/", "impressions": 500, "clicks": 5, "position": 12}],
        },
        "ga4_full": {"by_path": {"/": {"sessions": 20, "engagementRate": 0.6, "full_url": "https://ex.com/"}}},
        "fetched_at": "2026-01-01",
    }
    payload = {
        "categories": [{"id": "c", "issues": [{"url": "https://ex.com/", "priority": "High", "message": "m"}]}],
        "lighthouse_by_url": {
            "https://ex.com/": {"performance": 80, "seo": 90},
            "https://ex.com": {"performance": 70, "seo": 80},
        },
        "top_pages": [{"url": "https://ex.com/", "title": "Home"}],
    }

    with patch.object(Ctx, "load_google_full", return_value={
        "gsc_full": {"top_pages": [{"page": "https://ex.com/", "impressions": 100, "clicks": 1, "position": 10}]},
        "ga4_full": {"by_path": {}},
        "fetched_at": "2026-01-01",
    }):
        top_pages_only = insight_mod.get_landing_page_blended_table(conn, ctx, {})
        assert top_pages_only["total"] >= 0

    with patch.object(Ctx, "load_google_full", return_value=google_full):
        blended = insight_mod.get_landing_page_blended_table(conn, ctx, {})
        assert blended["total"] >= 0
        matrix = insight_mod.get_opportunity_matrix(conn, ctx, {})
        assert "counts" in matrix

    with patch.object(Ctx, "load_google_full", return_value=None), patch.object(
        Ctx, "load_google", return_value={"gsc": {"summary": {"clicks": 1}}, "ga4": {"summary": {"sessions": 2}}},
    ):
        health = insight_mod.get_traffic_health_check(conn, ctx, {})
        assert "diagnosis" in health

    assert insight_mod.get_landing_page_full_diagnosis(conn, ctx, {})["error"] == "url is required"
    with patch.object(Ctx, "load_payload", return_value=None):
        assert insight_mod.get_landing_page_full_diagnosis(conn, ctx, {"url": "https://ex.com/"})["missing"]

    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(
        Ctx, "load_google_full", return_value=google_full,
    ):
        diag = insight_mod.get_landing_page_full_diagnosis(conn, ctx, {"url": "https://ex.com/"})
        assert diag["url"] == "https://ex.com/"
        assert "diagnosis" in diag

    with patch.object(Ctx, "load_google_full", return_value=None), patch.object(Ctx, "load_google", return_value=None):
        assert insight_mod.get_traffic_health_check(conn, ctx, {})["missing"]

    with patch.object(insight_mod, "get_landing_page_blended_table", return_value={"error": "no google data", "missing": True}):
        assert insight_mod.get_opportunity_matrix(conn, ctx, {})["missing"]

    with patch.object(Ctx, "load_payload", return_value={
        "lighthouse_by_url": {"https://ex.com": {"performance": 70, "seo": 80}},
        "top_pages": [],
    }), patch.object(Ctx, "load_google_full", return_value=google_full):
        slash_diag = insight_mod.get_landing_page_full_diagnosis(conn, ctx, {"url": "https://ex.com/"})
        assert slash_diag["lighthouse"]["performance"] == 70

    with patch("website_profiling.tools.audit_tools.insight.insight_tools.list_issues", return_value={"error": "boom"}):
        assert insight_mod.get_issue_to_traffic_map(conn, ctx, {})["error"] == "boom"

    with patch("website_profiling.tools.audit_tools.insight.insight_tools.list_issues", return_value={
        "issues": ["bad", {
            "url": "https://ex.com/x",
            "priority": "High",
            "category": "onpage",
            "message": "issue",
            "impact_score": 10,
            "gsc_clicks": 5,
            "ga4_sessions": 3,
        }],
        "total": 1,
        "truncated": False,
    }):
        mapped2 = insight_mod.get_issue_to_traffic_map(conn, ctx, {})
        assert mapped2["total"] == 1

    issues_payload = {
        "categories": [{
            "id": "c",
            "issues": [{
                "url": "https://ex.com/x",
                "priority": "High",
                "category": "onpage",
                "message": "issue",
                "impact_score": 10,
                "gsc_clicks": 5,
                "ga4_sessions": 3,
            }, "bad"],
        }],
    }
    with patch.object(Ctx, "load_payload", return_value=issues_payload):
        mapped = insight_mod.get_issue_to_traffic_map(conn, ctx, {})
        assert mapped["total"] == 1


def test_router_tools_workflows(conn: MagicMock, ctx: Ctx) -> None:
    assert router_mod.search_audit_tools(conn, ctx, {})["error"] == "query is required"
    found = router_mod.search_audit_tools(conn, ctx, {"query": "broken links", "limit": 3})
    assert found["total"] >= 1
    assert found["tool_names"]

    domains = router_mod.list_tool_domains(conn, ctx, {})
    assert domains["domains"]
    assert domains["domain_tool_counts"]

    with patch.object(router_mod, "_dispatch", return_value={"ok": True}) as dispatch:
        traffic = router_mod.run_insight_workflow(conn, ctx, {"type": "traffic"})
        assert traffic["steps"][0]["tool"] == "get_traffic_health_check"
        landing = router_mod.run_insight_workflow(conn, ctx, {"type": "landing_pages"})
        assert len(landing["steps"]) == 2
        default = router_mod.run_insight_workflow(conn, ctx, {"type": "priorities"})
        assert len(default["steps"]) == 2

        tech = router_mod.run_technical_workflow(conn, ctx, {"baseline_report_id": 99})
        assert any(s["tool"] == "compare_issue_deltas" for s in tech["steps"])

        assert router_mod.run_keyword_workflow(conn, Ctx(property_id=None), {})["error"]
        kw = router_mod.run_keyword_workflow(conn, ctx, {})
        assert kw["workflow"] == "keyword"
        assert len(kw["steps"]) == 3
        assert dispatch.call_count >= 6

    assert router_mod.run_domain_agent(conn, ctx, {})["error"] == "task is required"

    with patch(
        "website_profiling.tools.audit_tools.registry.search_tools",
        return_value=[],
    ), patch(
        "website_profiling.tools.audit_tools.registry.tool_names_for_domain",
        return_value=["get_schema_coverage", "list_broken_links"],
    ), patch.object(router_mod, "_dispatch", return_value={"ok": True}):
        domain_only = router_mod.run_domain_agent(conn, ctx, {"task": "schema", "domain": "schema"})
        assert domain_only["tools_used"]

    with patch(
        "website_profiling.tools.audit_tools.registry.search_tools",
        return_value=[{"name": "get_schema_coverage"}],
    ), patch(
        "website_profiling.tools.audit_tools.registry.tool_names_for_domain",
        return_value=["get_schema_coverage"],
    ), patch.object(router_mod, "_dispatch", return_value={"ok": True}) as dispatch2:
        in_pool = router_mod.run_domain_agent(conn, ctx, {"task": "schema audit", "domain": "schema", "max_steps": 2})
        assert in_pool["tools_used"] == ["get_schema_coverage"]
        assert dispatch2.call_count == 1

    with patch(
        "website_profiling.tools.audit_tools.registry.search_tools",
        return_value=[{"name": "get_report_summary"}],
    ), patch(
        "website_profiling.tools.audit_tools.registry.tool_names_for_domain",
        return_value=[],
    ), patch.object(router_mod, "_dispatch", return_value={"ok": True}):
        global_pick = router_mod.run_domain_agent(conn, ctx, {"task": "report overview", "domain": "schema", "max_steps": 1})
        assert global_pick["tools_used"] == ["get_report_summary"]

    with patch(
        "website_profiling.tools.audit_tools.registry.search_tools",
        return_value=[],
    ), patch(
        "website_profiling.tools.audit_tools.registry.tool_names_for_domain",
        return_value=["get_schema_coverage"],
    ), patch.object(router_mod, "_dispatch", return_value={"ok": True}):
        domain_fallback = router_mod.run_domain_agent(conn, ctx, {"task": "schema", "domain": "schema"})
        assert domain_fallback["tools_used"] == ["get_schema_coverage"]

    with patch(
        "website_profiling.tools.audit_tools.registry.search_tools",
        return_value=[
            {"name": "list_broken_links"},
            {"name": "get_schema_coverage"},
        ],
    ), patch.object(router_mod, "_dispatch", return_value={"ok": True}):
        no_domain = router_mod.run_domain_agent(conn, ctx, {"task": "broken links audit", "max_steps": 1})
        assert no_domain["tools_used"] == ["list_broken_links"]


def test_registry_helpers_and_validation_errors() -> None:
    assert registry.tool_definition("get_report_summary") is not None
    assert registry.tool_definition("__missing__") is None
    assert registry.tool_names_for_tier(0)
    assert registry.list_domains_catalog()
    assert registry.search_tools("") == []
    assert registry.search_tools("get_report_summary", limit=5)[0]["name"] == "get_report_summary"
    assert registry._normalize_tool_args(None) == {}
    assert registry._normalize_tool_args("not-a-dict") == {}
    assert registry._normalize_tool_args({"keep": 1, "drop": None}) == {"keep": 1}

    filtered = registry.openai_tools_schema({"get_report_summary"})
    assert len(filtered) == 1
    assert filtered[0]["function"]["name"] == "get_report_summary"

    with patch.object(registry, "_TOOL_HANDLERS", {"a": lambda *a, **k: {}}):
        with patch.object(registry, "TOOL_DEFINITIONS", [{"name": "b", "description": "", "inputSchema": {}}]):
            errors = registry.validate_tool_registry()
    assert any("handler/catalog mismatch" in e for e in errors)

    with patch.object(registry, "_TOOL_HANDLERS", {"a": lambda *a, **k: {}}):
        with patch.object(registry, "TOOL_DEFINITIONS", [{"name": "a", "description": "", "inputSchema": {}}]):
            with patch.object(registry, "_TOOL_META", {"b": {"domain": "core", "tier": 1}}):
                errors = registry.validate_tool_registry()
    assert any("handler/meta mismatch" in e for e in errors)

    all_handlers = registry.tool_handler_names()
    missing_t0 = next(iter(registry.tier0_tool_names()))
    with patch.object(registry, "tool_handler_names", return_value=all_handlers - {missing_t0}):
        errors = registry.validate_tool_registry()
    assert any("tier0 tools missing" in e for e in errors)


def test_tool_domains_classify_and_catalog() -> None:
    with patch(
        "website_profiling.tools.audit_tools.tool_domains.TIER_0_TOOLS",
        frozenset({"synthetic_tier0_tool"}),
    ):
        assert classify_tool_domain("synthetic_tier0_tool") == "core"

    assert classify_tool_domain("get_landing_page_custom") == "insight"
    assert classify_tool_domain("get_page_ctr_detail") == "ctr"
    assert classify_tool_domain("list_competitor_domains") == "backlinks"
    assert classify_tool_domain("list_compare_new_issues") == "drift"

    meta = registry.tool_meta()
    meta_with_unknown = {**meta, "orphan_tool": {"domain": "noncanonical_domain", "tier": 1}}
    by_domain = tools_by_domain(meta_with_unknown)
    assert "noncanonical_domain" in by_domain

    tier1 = tool_names_for_tier(meta, 1)
    assert tier1
    full_bundle = tool_names_for_mcp_bundle(meta, "full")
    assert len(full_bundle) == len(meta) - len(CHAT_ONLY_TOOLS & meta.keys())
    core_bundle = tool_names_for_mcp_bundle(meta, "core")
    assert TIER_0_TOOLS <= core_bundle

    catalog = domains_catalog(meta)
    assert catalog
    assert all(row["domain"] in CANONICAL_DOMAINS for row in catalog)
    assert domains_catalog({}) == []


def test_tool_selector_edge_cases() -> None:
    with patch.dict(os.environ, {"CHAT_TOOL_MAX": "not-a-number"}):
        assert chat_tool_max() >= len(TIER_0_TOOLS) + 1

    history = [
        {"role": "assistant", "content": "hi"},
        {"role": "user", "content": "show gsc clicks and ga4 landing pages"},
    ]
    names = select_tools_for_turn("show gsc clicks", history=history)
    assert "get_google_summary" in names or "get_gsc_top_queries" in names

    with_extra = select_tools_for_turn("hello", extra_names={"search_audit_tools"})
    assert "search_audit_tools" in with_extra

    capped = apply_tool_cap(set(f"tool_{i}" for i in range(200)) | set(TIER_0_TOOLS), 50)
    assert len(capped) <= 50
    assert TIER_0_TOOLS <= capped

    text = compact_tool_list({"b_tool", "a_tool"})
    assert text.startswith("- a_tool")


def test_keywords_brand_and_intent(conn: MagicMock, ctx: Ctx) -> None:
    assert kw_mod.get_brand_keyword_split(conn, Ctx(property_id=None), {})["error"]
    with patch.object(Ctx, "load_keywords", return_value=None):
        assert kw_mod.get_brand_keyword_split(conn, ctx, {})["missing"]
    with patch.object(Ctx, "load_keywords", return_value={
        "brand_name": "Acme",
        "rows": [
            {"keyword": "acme shoes", "is_branded": True},
            {"keyword": "buy shoes", "is_branded": False},
        ],
    }):
        split = kw_mod.get_brand_keyword_split(conn, ctx, {})
        assert split["branded_count"] == 1
        assert split["non_branded_count"] == 1

    assert kw_mod.list_keywords_by_intent(conn, ctx, {})["error"] == "intent is required"
    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "a", "intent": "informational"}]}):
        assert kw_mod.list_keywords_by_intent(conn, ctx, {"intent": "informational"})["total"] == 1


def test_crawl_js_delta_skips_empty_url(conn: MagicMock, ctx: Ctx) -> None:
    df = pd.DataFrame([
        {"url": "", "fetch_method": "static", "word_count": 100, "title": "A", "h1": "H"},
        {"url": "https://ex.com/", "fetch_method": "static", "word_count": 100, "title": "A", "h1": "H"},
        {"url": "https://ex.com/", "fetch_method": "rendered", "word_count": 200, "title": "B", "h1": "H2"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        result = crawl_mod.list_pages_js_rendering_delta(conn, ctx, {})
    assert result["total"] == 1
