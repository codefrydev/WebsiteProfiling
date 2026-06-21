"""Tests for expanded audit tools (impact, payload extras, GEO, compare deltas)."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from website_profiling.tools.audit_tools import AuditToolContext, dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx


@pytest.fixture
def ctx() -> AuditToolContext:
    return AuditToolContext(property_id=1, report_id=1)


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


def _payload() -> dict:
    return {
        "categories": [
            {
                "id": "technical_seo",
                "name": "Technical",
                "score": 80,
                "issues": [
                    {
                        "priority": "Critical",
                        "message": "Missing title",
                        "url": "https://ex.com/a",
                        "impact_score": 1205.0,
                        "gsc_clicks": 20,
                    },
                    {"priority": "Low", "message": "Minor", "url": "", "impact_score": 1.0},
                ],
            }
        ],
        "indexation_coverage": {
            "counts": {"crawled": 10, "sitemap": 12},
            "lists": {"sitemap_only": ["https://ex.com/x"], "crawled_not_in_sitemap": [], "gsc_not_crawled": []},
            "lists_total": {"sitemap_only": 1, "crawled_not_in_sitemap": 0, "gsc_not_crawled": 0},
        },
        "orphan_urls": ["https://ex.com/orphan"],
        "rich_results_meta": {"checked": 2},
        "rich_results_validation": [{"url": "https://ex.com/bad", "status": "fail"}],
        "competitor_keyword_gap": [{"keyword": "widgets"}],
        "portfolio_benchmark": {"median_health_score": 70},
        "inlink_anchor_matrix": [{"target_url": "https://ex.com/", "anchor_text": "home", "inlink_count": 2}],
        "top_pages": [{"url": "https://ex.com/", "inlinks": 3, "outlinks": 0}],
        "links": [{"url": "https://ex.com/", "inlinks": 3, "outlinks": 0}],
        "ner_site_summary": {"entities": ["Acme"]},
        "schema_coverage": {"pages_with_schema": 5},
        "site_name": "Example",
    }


def _crawl_df() -> pd.DataFrame:
    return pd.DataFrame([
        {
            "url": "https://ex.com/",
            "status": "200",
            "title": "Home",
            "meta_description": "Home desc",
            "h1": "Home",
            "outlinks": 0,
            "mixed_content_count": 1,
            "total_js_bytes": 50000,
            "total_css_bytes": 10000,
            "script_count": 5,
            "content_html_ratio": 10,
            "reading_level": 8.5,
            "cache_control": "",
            "etag": "",
            "heading_sequence": "h1,h2",
            "heading_text": "Home\nSub",
            "content_excerpt": "Widgets are devices used for many purposes in industry and home.",
            "word_count": 400,
            "has_schema": "true",
            "page_analysis": json.dumps({"json_ld_types": ["Organization"], "axe_violations": [{"id": "label"}]}),
            "fetch_method": "static",
        },
        {
            "url": "https://ex.com/404-page",
            "status": "200",
            "title": "Page not found",
            "meta_description": "x",
            "h1": "Oops",
            "outlinks": 2,
            "mixed_content_count": 0,
            "page_analysis": "{}",
        },
        {
            "url": "https://ex.com/faq",
            "status": "200",
            "title": "FAQ",
            "meta_description": "FAQ",
            "h1": "FAQ?",
            "outlinks": 1,
            "has_schema": "false",
            "page_analysis": "{}",
        },
    ])


def test_list_top_impact_issues_includes_traffic_fields(conn: MagicMock, ctx: AuditToolContext) -> None:
    with patch.object(Ctx, "load_payload", return_value=_payload()):
        out = dispatch_tool("list_top_impact_issues", {"limit": 5}, context=ctx, conn=conn)
        assert out["issues"][0].get("impact_score") == 1205.0
        assert out["issues"][0].get("gsc_clicks") == 20


def test_payload_extras_tools(conn: MagicMock, ctx: AuditToolContext) -> None:
    with patch.object(Ctx, "load_payload", return_value=_payload()), patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()):
        assert dispatch_tool("get_rich_results_summary", {}, context=ctx, conn=conn)["meta"]["checked"] == 2
        failures = dispatch_tool("list_rich_results_failures", {}, context=ctx, conn=conn)
        assert failures["total"] == 1
        assert dispatch_tool("get_competitor_keyword_gap", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("get_portfolio_benchmark", {}, context=ctx, conn=conn)["benchmark"]["median_health_score"] == 70
        anchors = dispatch_tool("get_site_anchor_text_summary", {}, context=ctx, conn=conn)
        assert anchors["anchors"][0]["anchor_text"] == "home"


def test_crawl_extras_tools(conn: MagicMock, ctx: AuditToolContext) -> None:
    payload = _payload()
    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()):
        soft = dispatch_tool("list_pages_soft_404", {}, context=ctx, conn=conn)
        assert soft["total"] >= 1
        axe = dispatch_tool("get_axe_audit_summary", {}, context=ctx, conn=conn)
        assert axe["pages_with_violations"] >= 1
        mixed = dispatch_tool("list_pages_with_mixed_content", {}, context=ctx, conn=conn)
        assert mixed["total"] >= 1
        dupes = dispatch_tool("list_duplicate_title_groups", {}, context=ctx, conn=conn)
        assert "groups" in dupes
        outline = dispatch_tool("get_heading_outline_for_url", {"url": "https://ex.com/"}, context=ctx, conn=conn)
        assert outline.get("heading_sequence")


def test_compare_indexation_and_orphan_deltas(conn: MagicMock, ctx: AuditToolContext) -> None:
    current = _payload()
    baseline = {**_payload(), "indexation_coverage": {"counts": {"crawled": 8}, "lists": {}, "lists_total": {}}, "orphan_urls": []}
    with patch("website_profiling.tools.audit_tools.compare.compare_slices.load_compare_pair", return_value=(current, baseline, 2, 1, None)):
        idx = dispatch_tool("compare_indexation_deltas", {"baseline_report_id": 1}, context=ctx, conn=conn)
        assert idx["count_deltas"]
        orphan = dispatch_tool("compare_orphan_deltas", {"baseline_report_id": 1}, context=ctx, conn=conn)
        assert orphan["added_count"] >= 1


def test_geo_tools_mocked(conn: MagicMock, ctx: AuditToolContext) -> None:
    with patch.object(Ctx, "load_payload", return_value=_payload()), patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._fetch_llms_txt",
        return_value={"found": False},
    ):
        geo = dispatch_tool("get_geo_readiness_score", {}, context=ctx, conn=conn)
        assert 0 <= geo["geo_readiness_score"] <= 100
        faq = dispatch_tool("get_faq_schema_coverage", {}, context=ctx, conn=conn)
        assert "coverage_pct" in faq
        suggestions = dispatch_tool(
            "get_internal_link_suggestions",
            {"url": "https://ex.com/"},
            context=ctx,
            conn=conn,
        )
        assert "suggestions" in suggestions


def test_prioritize_fix_roadmap(conn: MagicMock, ctx: AuditToolContext) -> None:
    with patch.object(Ctx, "load_payload", return_value=_payload()):
        out = dispatch_tool("prioritize_fix_roadmap", {"limit": 5}, context=ctx, conn=conn)
        assert out["roadmap"][0]["rank"] == 1
        assert out["roadmap"][0]["impact_score"] == 1205.0


def test_integration_tools_missing_config(conn: MagicMock, ctx: AuditToolContext) -> None:
    with patch("website_profiling.tools.audit_tools.integrations.integration_tools.get_property_by_id", return_value={"canonical_domain": "ex.com"}):
        gsc = dispatch_tool("get_gsc_url_inspection", {"url": "https://ex.com/"}, context=ctx, conn=conn)
        assert gsc["missing"] is True
        bing = dispatch_tool("get_bing_index_status", {"url": "https://ex.com/"}, context=ctx, conn=conn)
        assert bing["missing"] is True


def test_gsc_index_coverage_from_payload(conn: MagicMock, ctx: AuditToolContext) -> None:
    with patch.object(Ctx, "load_payload", return_value=_payload()):
        out = dispatch_tool("get_gsc_index_coverage", {}, context=ctx, conn=conn)
        assert out["counts"]["crawled"] == 10
        assert out["provenance"] == "Estimated"


def test_gsc_url_inspection_mocked(conn: MagicMock, ctx: AuditToolContext) -> None:
    prop = {"google_refresh_token": "tok", "gsc_site_url": "https://ex.com/"}
    with patch("website_profiling.tools.audit_tools.integrations.integration_tools.get_property_by_id", return_value=prop), patch(
        "website_profiling.tools.audit_tools.integrations.integration_tools.build_credentials",
        return_value=object(),
    ), patch(
        "website_profiling.tools.audit_tools.integrations.integration_tools.inspect_url",
        return_value={"verdict": "PASS", "provenance": "GSC"},
    ):
        out = dispatch_tool("get_gsc_url_inspection", {"url": "https://ex.com/page"}, context=ctx, conn=conn)
        assert out["verdict"] == "PASS"
