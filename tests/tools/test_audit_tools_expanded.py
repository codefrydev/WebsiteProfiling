"""Expanded coverage tests for all audit_tools handlers."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from website_profiling.tools.audit_tools import AuditToolContext, dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.audit_tools.registry import TOOL_DEFINITIONS, tool_handler_names
from website_profiling.tools.audit_tools import _slice


def _full_payload() -> dict:
    return {
        "site_name": "Example",
        "report_generated_at": "2026-06-07T12:00:00Z",
        "crawl_run_id": 9,
        "summary": {
            "total_urls": 10,
            "count_2xx": 8,
            "count_3xx": 1,
            "count_4xx": 1,
            "count_5xx": 0,
            "success_rate": 80,
            "crawl_time_s": 12.5,
            "avg_outlinks": 3.2,
        },
        "seo_health": {
            "missing_title": 1,
            "title_ok": 9,
            "thin_content": 2,
        },
        "status_counts": {"200": 8, "404": 1},
        "redirects": [{"url": "https://ex.com/old", "status": "301", "final_url": "https://ex.com/new"}],
        "orphan_urls": ["https://ex.com/orphan"],
        "executive_summary": {"headline": "OK", "bullets": ["Fix titles"]},
        "report_meta": {
            "crawl_scope": {"render_mode": "static"},
            "browser_diagnostics": {"summary": {"error_count": 1}},
        },
        "site_level": {"robots_present": True, "sitemap_present": True},
        "indexation_coverage": {
            "counts": {"crawled": 10, "gsc_pages": 8},
            "lists": {"gsc_not_crawled": [], "sitemap_only": ["https://ex.com/sitemap-only"], "crawled_not_in_sitemap": []},
            "lists_total": {"gsc_not_crawled": 0, "sitemap_only": 1, "crawled_not_in_sitemap": 0},
            "url_join": [{"url": "https://ex.com/", "in_crawl": True, "in_gsc": True}],
        },
        "hreflang_summary": {"pages_with_hreflang": 2},
        "language_summary": {"en": 8},
        "content_analytics": {
            "word_count_stats": {"mean": 400, "median": 350},
            "thin_pages": [{"url": "https://ex.com/thin", "word_count": 50}],
            "top_keywords_site": [{"word": "widgets"}],
        },
        "content_duplicates": [{"id": "d1", "representative_url": "https://ex.com/a", "member_count": 2}],
        "social_coverage": {"og_coverage_pct": 90, "twitter_coverage_pct": 70},
        "keyword_opportunities": {"hints": []},
        "ner_site_summary": {"entities": ["Acme"]},
        "semantic_keyword_clusters": [{"name": "widgets", "keywords": ["widget"]}],
        "outbound_link_domains": [{"domain": "external.com", "count": 3}],
        "top_pages": [{"url": "https://ex.com/", "inlinks": 5}],
        "graph_nodes": [1, 2],
        "graph_edges": [[1, 2]],
        "url_fingerprints": [{"pattern": "/blog/*", "count": 3}],
        "response_time_stats": {"p50": 120, "p95": 400},
        "depth_distribution": {"0": 1, "1": 9},
        "crawl_segments": [{"prefix": "/blog", "urls": 4}],
        "security_findings": [{"url": "https://ex.com", "severity": "high", "finding_type": "hsts", "message": "Missing HSTS"}],
        "tech_stack_summary": {"technologies": [{"name": "WordPress", "count": 10}]},
        "competitor_link_gap": {"gaps": [{"domain": "rival.com"}]},
        "competitor_keyword_gap": [{"keyword": "widgets", "competitor": "rival.com"}],
        "portfolio_benchmark": {"median_health_score": 75, "property_health_score": 80},
        "rich_results_meta": {"checked": 5, "gsc_count": 2, "heuristic_count": 3},
        "rich_results_validation": [
            {"url": "https://ex.com/", "status": "pass"},
            {"url": "https://ex.com/bad", "status": "fail", "message": "Invalid schema"},
        ],
        "inlink_anchor_matrix": [{"target_url": "https://ex.com/", "anchor_text": "home", "inlink_count": 3}],
        "bing_backlinks": {"ok": True, "total": 100},
        "crux_summary": {"ok": True, "lcp_p75": 2.1},
        "gsc_links": {"imported_at": "2026-06-01", "top_linking_sites": []},
        "lighthouse_summary": {"performance": 72},
        "lighthouse_human_summary": "OK",
        "lighthouse_diagnostics": [{"id": "render-blocking"}],
        "lighthouse_by_url": {
            "https://ex.com/slow": {"performance": 40},
            "https://ex.com/ok": {"performance": 90},
        },
        "google": {
            "fetched_at": "2026-06-07",
            "gsc": {
                "summary": {"clicks": 1, "impressions": 10},
                "top_queries": [{"query": "widgets", "clicks": 1}],
                "top_pages": [{"page": "https://ex.com/", "clicks": 1}],
                "pages": [{"page": "https://ex.com/", "clicks": 1}],
            },
            "ga4": {"summary": {"sessions": 5}, "top_pages": [{"path": "/"}]},
        },
        "keywords": {
            "fetched_at": "2026-06-07",
            "total_keywords": 2,
            "rows": [{"keyword": "widgets", "score": 0.5, "gsc_clicks": 3}],
            "striking_distance": [{"keyword": "repair"}],
            "cannibalisation": [{"query": "widgets", "urls": ["https://ex.com/a", "https://ex.com/b"]}],
            "query_page_misalignment": [{"keyword": "buy widgets", "url": "https://ex.com/wrong"}],
        },
        "recommendations": ["Fix broken links", "Add titles"],
        "ml_errors": [],
        "site_ssl_expires_at": "2027-01-01T00:00:00Z",
        "content_urls": {
            "missing_title": [{"url": "https://ex.com/notitle", "title": ""}],
            "missing_h1": [],
            "multiple_h1": [],
            "missing_meta_desc": [],
            "meta_desc_short": [],
            "meta_desc_long": [],
            "thin_content": [{"url": "https://ex.com/thin", "content_length": 100}],
        },
        "issues": {
            "broken": [{"url": "https://ex.com/broken", "status": "404"}],
            "seo": [{"type": "missing_title", "url": "https://ex.com/notitle", "message": "Missing title"}],
        },
        "mime_labels": ["text/html"],
        "mime_values": [9],
        "title_labels": ["0-30"],
        "title_counts": [1],
        "domain_labels": ["ex.com"],
        "domain_values": [10],
        "outlink_labels": ["0-5"],
        "outlink_counts": [8],
        "links": [
            {"url": "https://ex.com/", "inlinks": 5, "outlinks": 3, "word_count": 400},
            {"url": "https://ex.com/new", "inlinks": 1, "outlinks": 2, "word_count": 200},
        ],
        "categories": [
            {
                "id": "technical_seo",
                "name": "Technical SEO",
                "score": 80,
                "issues": [
                    {
                        "priority": "Critical",
                        "message": "Missing title",
                        "url": "https://ex.com/a",
                        "recommendation": "Add title",
                        "impact_score": 1205.0,
                        "gsc_clicks": 20,
                        "gsc_impressions": 500,
                        "ga4_sessions": 1,
                    },
                    {"priority": "High", "message": "Slow page", "url": "https://ex.com/blog/slow", "recommendation": "Optimize"},
                ],
            },
            {
                "id": "link_health",
                "name": "Links",
                "score": 70,
                "issues": [{"priority": "High", "message": "Broken link", "url": "https://ex.com/404", "recommendation": "Fix"}],
            },
        ],
    }


@pytest.fixture
def ctx() -> AuditToolContext:
    return AuditToolContext(property_id=1, report_id=1)


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


def test_handler_schema_parity() -> None:
    names = {t["name"] for t in TOOL_DEFINITIONS}
    assert names == tool_handler_names()
    assert len(TOOL_DEFINITIONS) == 356


def test_slice_helpers() -> None:
    assert _slice.parse_limit("bad", 10, 20) == 10
    assert _slice.parse_limit(100, 10, 20) == 20
    capped = _slice.cap_list([1, 2, 3], 2)
    assert capped["truncated"] is True
    field = _slice.payload_field({"items": [1, 2]}, "items", 1)
    assert field["total"] == 2
    assert _slice.payload_field({"x": "y"}, "missing")["missing"] is True
    assert _slice.payload_dict_slice({"meta": {"a": 1}}, "meta")["missing"] is False


def test_crawl_filter_schema(conn: MagicMock, ctx: AuditToolContext) -> None:
    df = pd.DataFrame([
        {
            "url": "https://ex.com/a",
            "status": "200",
            "has_schema": "true",
            "page_analysis": json.dumps({"json_ld_types": ["Organization"]}),
        },
        {"url": "https://ex.com/b", "status": "200", "has_schema": "false", "page_analysis": "{}"},
    ])
    with patch.object(Ctx, "load_payload", return_value=_full_payload()), patch.object(Ctx, "load_crawl_df", return_value=df):
        cov = dispatch_tool("get_schema_coverage", {}, context=ctx, conn=conn)
        assert cov["with_schema"] == 1
        no_schema = dispatch_tool("list_pages_without_schema", {}, context=ctx, conn=conn)
        assert no_schema["total"] == 1
        by_type = dispatch_tool("search_pages_by_schema_type", {"schema_type": "Organization"}, context=ctx, conn=conn)
        assert by_type["total"] == 1


def test_all_payload_tools(conn: MagicMock, ctx: AuditToolContext) -> None:
    payload = _full_payload()
    gsc_links = {
        "imported_at": "2026-06-01",
        "top_linking_sites": [{"domain": "ref.com"}],
        "sample_links": [{"source_url": "https://ref.com", "target_url": "https://ex.com/"}],
        "latest_links": [],
        "third_party_overlays": [{"provider": "moz", "referring_domains": 10}],
    }
    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(
        Ctx, "load_keywords", return_value=payload["keywords"],
    ), patch.object(Ctx, "load_google", return_value=payload["google"]), patch.object(
        Ctx, "load_gsc_links", return_value=gsc_links,
    ), patch(
        "website_profiling.tools.audit_tools.backlinks.read_gsc_links_status",
        return_value={"hasData": True},
    ), patch(
        "website_profiling.tools.audit_tools.keywords.read_keyword_history",
        return_value=[{"fetched_at": "2026-06-07", "position": 5}],
    ), patch(
        "website_profiling.tools.audit_tools.ops.check_all_alerts",
        return_value=[{"type": "health_drop"}],
    ), patch(
        "website_profiling.tools.audit_tools.crawl.slice_from_google_row",
        return_value={"queries": []},
    ), patch(
        "website_profiling.tools.audit_tools.ops.get_property_by_id",
        return_value={"id": 1, "google_refresh_token": "tok", "gsc_site_url": "sc-domain:ex.com"},
    ), patch.object(
        conn, "execute",
        return_value=MagicMock(fetchone=MagicMock(return_value={"schedule_cron": "0 9 * * 1", "alert_webhook_url": None, "alert_email": None}), fetchall=MagicMock(return_value=[])),
    ):
        tools = [
            ("get_executive_summary", {}),
            ("get_report_meta", {}),
            ("get_site_level", {}),
            ("list_redirects", {}),
            ("list_broken_links", {}),
            ("get_status_code_breakdown", {}),
            ("get_response_time_stats", {}),
            ("get_depth_distribution", {}),
            ("get_crawl_segments", {}),
            ("get_browser_diagnostics_summary", {}),
            ("get_seo_health", {}),
            ("list_orphan_pages", {}),
            ("get_top_linked_pages", {}),
            ("get_outbound_link_domains", {}),
            ("get_link_graph_summary", {}),
            ("get_url_fingerprints", {}),
            ("get_indexation_coverage", {}),
            ("get_hreflang_summary", {}),
            ("get_language_summary", {}),
            ("get_content_analytics", {}),
            ("get_content_duplicates", {}),
            ("get_social_coverage", {}),
            ("get_keyword_opportunities", {}),
            ("get_ner_site_summary", {}),
            ("list_thin_content_pages", {}),
            ("get_striking_distance_keywords", {"property_id": 1}),
            ("get_keyword_cannibalisation", {"property_id": 1}),
            ("get_query_page_misalignment", {"property_id": 1}),
            ("get_semantic_keyword_clusters", {}),
            ("get_keyword_history", {"property_id": 1, "keyword": "widgets"}),
            ("get_gsc_top_queries", {}),
            ("get_gsc_top_pages", {}),
            ("get_ga4_summary", {}),
            ("get_gsc_page_query_slice", {"url": "https://ex.com/"}),
            ("get_gsc_links_summary", {"property_id": 1}),
            ("get_gsc_links_import_status", {"property_id": 1}),
            ("get_competitor_link_gap", {}),
            ("get_bing_backlinks_summary", {}),
            ("get_lighthouse_diagnostics", {}),
            ("get_crux_summary", {}),
            ("list_slow_pages", {}),
            ("get_integration_alerts", {"property_id": 1}),
            ("get_tech_stack_summary", {}),
            ("get_security_findings", {}),
            ("list_issues_by_category", {"category_id": "technical_seo"}),
            ("get_category_issues", {"category_id": "technical_seo"}),
            ("get_audit_recommendations", {}),
            ("get_ml_errors", {}),
            ("get_ssl_expiry_info", {}),
            ("list_audit_categories", {}),
            ("get_category_recommendations", {"category_id": "technical_seo"}),
            ("list_issues_with_ai_fixes", {}),
            ("list_seo_onpage_issues", {}),
            ("list_content_url_issues", {"bucket": "missing_title"}),
            ("list_pages_missing_title", {}),
            ("list_pages_noindex", {}),
            ("get_crawl_summary", {}),
            ("get_mime_type_breakdown", {}),
            ("get_title_length_distribution", {}),
            ("get_top_crawled_pages", {}),
            ("list_indexation_gaps", {"gap_type": "sitemap_only"}),
            ("get_indexation_url_join", {}),
            ("get_gsc_sample_links", {"property_id": 1}),
            ("get_gsc_latest_links", {"property_id": 1}),
            ("get_third_party_links_overlay", {"property_id": 1}),
            ("get_property_ops", {"property_id": 1}),
            ("get_google_integration_status", {"property_id": 1}),
            ("get_keyword_serp_overlay", {"property_id": 1}),
            ("get_lighthouse_human_summary", {}),
            ("list_lighthouse_poor_seo_pages", {}),
            ("get_crawl_links_table", {}),
            ("get_graph_edges_sample", {}),
        ]
        for name, args in tools:
            result = dispatch_tool(name, args, context=ctx, conn=conn)
            assert "error" not in result or result.get("missing"), f"{name} failed: {result}"


def test_empty_and_error_paths(conn: MagicMock, ctx: AuditToolContext) -> None:
    with patch.object(Ctx, "load_payload", return_value={}):
        for name in (
            "get_executive_summary",
            "get_indexation_coverage",
            "get_crawl_segments",
            "get_competitor_link_gap",
            "get_crux_summary",
            "list_orphan_pages",
        ):
            r = dispatch_tool(name, {}, context=ctx, conn=conn)
            assert "error" in r

    with patch.object(Ctx, "load_payload", return_value=_full_payload()):
        assert dispatch_tool("list_issues_by_category", {}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("get_category_issues", {}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("get_category_issues", {"category_id": "nope"}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("search_pages_by_schema_type", {}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("get_keyword_history", {"property_id": 1}, context=ctx, conn=conn)["error"]
        no_prop_ctx = AuditToolContext(property_id=None)
        assert dispatch_tool("get_gsc_links_summary", {}, context=no_prop_ctx, conn=conn)["error"]
        assert dispatch_tool("get_integration_alerts", {}, context=AuditToolContext(property_id=None), conn=conn)["error"]

    with patch.object(Ctx, "load_google", return_value={"gsc": {}, "ga4": {}}):
        assert dispatch_tool("get_ga4_summary", {}, context=ctx, conn=conn).get("missing") or dispatch_tool(
            "get_ga4_summary", {}, context=ctx, conn=conn,
        ).get("error")

    df = pd.DataFrame()
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        assert dispatch_tool("get_schema_coverage", {}, context=ctx, conn=conn)["error"]


def test_context_loaders(conn: MagicMock) -> None:
    ctx = Ctx(property_id=1, report_id=2)
    with patch("website_profiling.tools.audit_tools.context.read_latest_gsc_links_data", return_value={"x": 1}):
        assert ctx.load_gsc_links(conn)["x"] == 1
    with patch("website_profiling.tools.audit_tools.context.read_latest_gsc_links_data", return_value=None), patch.object(
        Ctx, "load_payload", return_value={"gsc_links": {"y": 2}},
    ):
        assert ctx.load_gsc_links(conn)["y"] == 2
    with patch("website_profiling.tools.audit_tools.context.read_report_payload", return_value={"a": 1}):
        assert ctx.load_report_payload_by_id(conn, 5)["a"] == 1
    with patch("website_profiling.tools.audit_tools.context.get_property_by_id", return_value={"canonical_domain": "ex.com"}):
        assert ctx.resolve_property_domain(conn) == "ex.com"
    merged_bad = ctx.with_args({"property_id": "x", "report_id": "y"})
    assert merged_bad.property_id == 1


def test_list_report_history_and_workflow(conn: MagicMock, ctx: AuditToolContext) -> None:
    from tests.db_test_fakes import FakeConn, FakeCursor

    now = datetime.now(timezone.utc)
    fake = FakeConn()
    fake.set_next_cursor(
        FakeCursor(
            fetchall_value=[{
                "id": 10,
                "site_name": "Ex",
                "canonical_domain": "ex.com",
                "generated_at": now,
            }],
        ),
    )
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"):
        hist = dispatch_tool("list_report_history", {"property_id": 1}, conn=fake)
    assert hist["count"] == 1

    fake2 = FakeConn()
    fake2.set_next_cursor(
        FakeCursor(
            fetchall_value=[{
                "issue_key": "k1",
                "url": "https://ex.com",
                "category": "Tech",
                "priority": "High",
                "message": "msg",
                "status": "open",
                "assignee": None,
                "note": None,
                "updated_at": now,
            }],
        ),
    )
    wf = dispatch_tool("list_issue_workflow", {"property_id": 1}, conn=fake2)
    assert wf["count"] == 1


def test_compare_reports(conn: MagicMock, ctx: AuditToolContext) -> None:
    current = _full_payload()
    baseline = {**current, "summary": {**current["summary"], "total_urls": 8}}
    with patch("website_profiling.tools.audit_tools.compare.read_report_payload", side_effect=[current, baseline]):
        result = dispatch_tool("compare_reports", {"baseline_report_id": 1}, context=ctx, conn=conn)
    assert "health_score" in result
    with patch("website_profiling.tools.audit_tools.compare_helpers.read_report_payload", side_effect=[current, baseline]):
        diff = dispatch_tool("compare_url_set_diff", {"baseline_report_id": 1}, context=ctx, conn=conn)
    assert "new_count" in diff
    assert dispatch_tool("compare_reports", {}, context=ctx, conn=conn)["error"]
    with patch(
        "website_profiling.tools.audit_tools.compare.read_report_payload",
        side_effect=[None, baseline],
    ):
        assert "not found" in dispatch_tool("compare_reports", {"baseline_report_id": 1}, context=ctx, conn=conn)["error"]


def test_new_gap_closure_tools(conn: MagicMock, ctx: AuditToolContext) -> None:
    payload = _full_payload()
    payload["content_urls"] = {
        **payload.get("content_urls", {}),
        "missing_canonical": [{"url": "https://ex.com/a", "title": "A"}],
        "canonical_mismatch": [{"url": "https://ex.com/b", "canonical_url": "https://ex.com/other", "title": "B"}],
        "missing_alt": [{"url": "https://ex.com/c", "images_without_alt": 2, "images_total": 3}],
    }
    payload["social_coverage"] = {"og_image_missing": ["https://ex.com/d"]}
    payload["security_findings"] = [
        {"url": "https://ex.com", "severity": "High", "finding_type": "hsts", "message": "missing"},
    ]
    payload["lighthouse_by_url"] = {
        "https://ex.com/slow": {
            "median_metrics": {"lcp_ms": 4000, "cls": 0.2, "tbt_ms": 300, "accessibility_score": 40, "best_practices_score": 45},
            "accessibility": 40,
            "best-practices": 45,
        },
    }
    payload["graph_edges"] = [{"from": "https://ex.com/src", "to": "https://ex.com/broken"}]
    payload["issues"] = {"broken": [{"url": "https://ex.com/broken", "status": "404"}]}
    payload["tech_stack_summary"] = {"technologies": [{"name": "WordPress", "count": 2, "sample_urls": ["https://ex.com/wp"]}]}
    df = pd.DataFrame([
        {
            "url": "https://ex.com/a",
            "status": "200",
            "canonical_url": "",
            "images_without_alt": 1,
            "images_total": 2,
            "heading_sequence": "h1,h3",
            "viewport_present": "false",
            "redirect_chain_length": 2,
            "og_image": "",
            "pagerank": 0.5,
            "tech_stack": '["WordPress"]',
        },
    ])
    log_row = {
        "upload_id": 1,
        "filename": "access.log",
        "line_count": 100,
        "analysis": {
            "top_paths": [{"path": "/hot", "hits": 50}],
            "parsed_lines": 100,
            "googlebot_hits": 10,
            "crawl_compare": {"log_only_paths": ["/log-only"], "crawl_only_paths": ["/crawl-only"]},
        },
    }
    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert dispatch_tool("list_pages_missing_canonical", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_canonical_mismatch", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_pages_with_missing_alt", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_pages_without_lazy_images", {}, context=ctx, conn=conn)["total"] >= 0
        assert dispatch_tool("list_pages_with_images_missing_dimensions", {}, context=ctx, conn=conn)["total"] >= 0
        assert dispatch_tool("get_image_audit_summary", {}, context=ctx, conn=conn)["pages_missing_alt"] >= 0
        assert dispatch_tool("list_pages_skipped_headings", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_pages_missing_viewport", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_long_redirect_chains", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_pages_missing_og_image", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("get_top_pages_by_pagerank", {}, context=ctx, conn=conn)["total"] >= 0
        assert dispatch_tool("get_security_findings_summary", {}, context=ctx, conn=conn)["total_findings"] == 1
        assert dispatch_tool("list_security_findings_by_type", {"finding_type": "hsts"}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_broken_link_sources", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_pages_by_technology", {"technology_name": "WordPress"}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("get_duplicate_cluster", {"cluster_index": 0}, context=ctx, conn=conn)["cluster_index"] == 0
        assert dispatch_tool("search_issues", {"message_contains": "title"}, context=ctx, conn=conn)["total"] >= 0
        assert dispatch_tool("list_lighthouse_poor_accessibility_pages", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_lighthouse_poor_best_practices_pages", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_lighthouse_cwv_failures", {}, context=ctx, conn=conn)["total"] == 1
    with patch("website_profiling.tools.audit_tools.ops._load_log_analysis", return_value=log_row):
        assert dispatch_tool("get_log_top_paths", {"property_id": 1}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_log_only_paths", {"property_id": 1}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_crawl_only_paths", {"property_id": 1}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("get_log_googlebot_stats", {"property_id": 1}, context=ctx, conn=conn)["googlebot_hits"] == 10
    with patch("website_profiling.tools.audit_tools.compare_helpers.read_report_payload", return_value=payload):
        assert "security_deltas" in dispatch_tool("compare_security_deltas", {"baseline_report_id": 1}, context=ctx, conn=conn)
        assert "health_score" in dispatch_tool("compare_health_score_delta", {"baseline_report_id": 1}, context=ctx, conn=conn)
    with patch("website_profiling.tools.audit_tools.llm_tools.list_properties_public", return_value=[{"id": 1, "name": "ex.com", "canonical_domain": "ex.com"}]):
        conn.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value={"health_score": 80, "generated_at": datetime.now(timezone.utc), "report_id": 1, "issue_counts": "{}"})))
        assert dispatch_tool("get_portfolio_summary", {}, conn=conn)["count"] == 1
    with patch("website_profiling.tools.audit_tools.llm_tools.batch_expand", return_value={"widgets": {"web": ["widgets near me"]}}):
        assert dispatch_tool("expand_keywords", {"seeds": ["widgets"]}, context=ctx, conn=conn)["seed_count"] == 1
    assert dispatch_tool("generate_content_brief", {"keyword": "widgets"}, context=ctx, conn=conn)["brief"]["keyword"] == "widgets"


def test_export_tools(conn: MagicMock, ctx: AuditToolContext, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    payload = _full_payload()
    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export_tools.export_audit_csv",
        return_value="url,status\nhttps://ex.com,200\n",
    ):
        out = dispatch_tool("export_audit_report", {"format": "csv"}, context=ctx, conn=conn)
        assert out.get("artifact_id")
        assert out.get("filename", "").endswith(".csv")
    formats = dispatch_tool("list_export_formats", {}, context=ctx, conn=conn)
    assert formats.get("formats")
    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export_tools._dispatch",
        return_value={"pages": [{"url": "https://ex.com/broken", "status": "404"}], "total": 1, "truncated": False},
    ):
        csv_out = dispatch_tool(
            "export_list_as_csv",
            {"tool_name": "list_broken_links", "tool_args": {}},
            context=ctx,
            conn=conn,
        )
        assert csv_out.get("artifact_id")
        assert csv_out.get("total") == 1
    with patch("website_profiling.tools.audit_tools.export_tools.load_compare_pair") as mock_pair:
        mock_pair.return_value = (payload, payload, 2, 1, None)
        cmp_out = dispatch_tool("export_compare_csv", {"baseline_report_id": 1}, context=ctx, conn=conn)
        assert cmp_out.get("artifact_id")
