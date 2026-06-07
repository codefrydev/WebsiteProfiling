"""Line-coverage tests for audit_tools edge paths."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pandas as pd

from website_profiling.tools.audit_tools import _slice, dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.audit_tools import compare as compare_mod
from website_profiling.tools.audit_tools import crawl as crawl_mod
from website_profiling.tools.audit_tools import keywords as kw_mod
from website_profiling.tools.audit_tools import report as report_mod
from website_profiling.tools.audit_tools import health as health_mod
from website_profiling.tools.audit_tools import google as google_mod
from website_profiling.tools.audit_tools import lighthouse as lh_mod
from website_profiling.tools.audit_tools import links as links_mod
from website_profiling.tools.audit_tools import backlinks as bl_mod
from website_profiling.tools.audit_tools import content as content_mod
from website_profiling.tools.audit_tools import issues as issues_mod
from website_profiling.tools.audit_tools import schema as schema_mod


def test_slice_edge_cases() -> None:
    assert _slice.payload_field({"n": 1}, "n", 5)["total"] == 1
    assert _slice.payload_field({"x": [1]}, "x", 5, filter_fn=lambda i: False)["total"] == 0
    assert _slice.crawl_filter(None)["total"] == 0
    df = pd.DataFrame([
        {"url": "https://ex.com", "status": "200", "page_analysis": "not-json"},
        {"url": "https://ex.com/2", "status": "200", "has_schema": "true", "page_analysis": "{}"},
    ])
    assert _slice.crawl_filter(df, url_contains="ex")["total"] == 2
    assert _slice.crawl_filter(df, status="404")["total"] == 0
    row = {"page_analysis": json.dumps({"schema_types": "Article"})}
    assert _slice._row_schema_types_list(row) == ["Article"]
    assert _slice._row_schema_types(row) == "article"


def test_report_helpers() -> None:
    assert report_mod._normalize_priority("") == ""
    assert report_mod._normalize_priority("critical") == "Critical"
    issues = report_mod._iter_category_issues({"categories": ["bad", {"id": "x", "issues": ["bad", {"priority": "Low", "message": "m"}]}]})
    assert issues
    assert report_mod._health_score({"categories": [{"score": "bad"}]}) is None
    conn = MagicMock()
    ctx = Ctx()
    with patch.object(Ctx, "load_payload", return_value={}):
        assert report_mod.get_executive_summary(conn, ctx, {})["error"]
        assert report_mod.get_report_meta(conn, ctx, {})["error"]
        assert report_mod.get_site_level(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_payload", return_value={"executive_summary": {"headline": "OK"}}):
        assert report_mod.get_executive_summary(conn, ctx, {})["executive_summary"]["headline"] == "OK"


def test_compare_paths() -> None:
    conn = MagicMock()
    ctx = Ctx(property_id=1)
    with patch.object(compare_mod, "read_report_payload", return_value={"categories": []}):
        assert compare_mod.compare_reports(conn, ctx, {"baseline_report_id": "x"})["error"] == "invalid baseline_report_id"

    conn.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value=None)))
    with patch.object(compare_mod, "read_report_payload", return_value=None):
        assert "no current" in compare_mod.compare_reports(conn, ctx, {"baseline_report_id": 1})["error"]

    conn.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value={"id": 5})))
    with patch.object(compare_mod, "read_report_payload", side_effect=[{"a": 1}, None]):
        assert "not found" in compare_mod.compare_reports(conn, Ctx(report_id=None), {"baseline_report_id": 1})["error"]

    assert compare_mod._row_id({"id": 3}) == 3
    assert compare_mod._row_id((7,)) == 7


def test_context_loaders(conn: MagicMock | None = None) -> None:
    conn = conn or MagicMock()
    ctx = Ctx()
    with patch("website_profiling.tools.audit_tools.context.read_report_payload", return_value=None):
        assert ctx.load_report_payload_by_id(conn, 1) == {}
    with patch.object(Ctx, "load_payload", return_value={"top_pages": [{"url": "https://www.ex.com/page"}]}):
        assert ctx.resolve_property_domain(conn) == "www.ex.com"
    with patch.object(Ctx, "load_payload", return_value={}):
        assert ctx.resolve_property_domain(conn) == ""
    with patch("website_profiling.tools.audit_tools.context.read_crawl", return_value=pd.DataFrame()), patch.object(
        Ctx, "load_payload", return_value={"crawl_run_id": "bad"},
    ):
        assert ctx.load_crawl_df(conn).empty


def test_keywords_and_google(conn: MagicMock | None = None) -> None:
    conn = conn or MagicMock()
    ctx = Ctx(property_id=1)
    assert kw_mod.search_keywords(conn, ctx, {"query": ""})["error"]
    with patch.object(Ctx, "load_keywords", return_value=None):
        assert kw_mod.get_striking_distance_keywords(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_keywords", return_value={"rows": "bad"}):
        assert kw_mod.get_keyword_summary(conn, ctx, {"limit": "x"})["total_keywords"] == 0
    with patch.object(Ctx, "load_google", return_value=None):
        assert google_mod.get_gsc_top_queries(conn, ctx, {})["error"]
        assert google_mod.get_gsc_page_query_slice(conn, ctx, {})["error"]


def test_crawl_lighthouse_links(conn: MagicMock | None = None) -> None:
    conn = conn or MagicMock()
    ctx = Ctx()
    with patch.object(Ctx, "load_payload", return_value={"report_meta": {}}):
        assert crawl_mod.get_browser_diagnostics_summary(conn, ctx, {})["browser_diagnostics"] is None
    df = pd.DataFrame([{"url": "https://ex.com/a", "status": "200", "title": "T", "meta_description": "d", "h1": "h", "word_count": 1, "inlinks": 0, "outlinks": 0, "content_type": "text/html"}])
    with patch.object(Ctx, "load_crawl_df", return_value=df), patch.object(Ctx, "load_payload", return_value={"lighthouse_by_url": {}}), patch.object(Ctx, "load_google", return_value=None):
        assert crawl_mod.get_page_details(conn, ctx, {"url": "https://ex.com/a"})["found_in_crawl"]
    with patch.object(Ctx, "load_payload", return_value={}):
        assert links_mod.list_orphan_pages(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_payload", return_value={"lighthouse_by_url": {}}), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_page_summaries", return_value={},
    ):
        assert lh_mod.get_lighthouse_for_url(conn, ctx, {"url": "https://ex.com"})["error"]


def test_security_workflow_backlinks() -> None:
    from website_profiling.tools.audit_tools import security as sec_mod
    from website_profiling.tools.audit_tools import workflow as wf_mod

    conn = MagicMock()
    payload = {"security_findings": [{"url": "u", "severity": "High", "finding_type": "x", "message": "m"}]}
    ctx = Ctx()
    with patch.object(Ctx, "load_payload", return_value=payload):
        assert sec_mod.get_security_findings(conn, ctx, {"severity": "low"})["total"] == 0
        assert sec_mod.get_security_findings(conn, ctx, {"severity": "high"})["total"] == 1
        assert sec_mod.get_security_findings(conn, ctx, {"severity": "High", "limit": "bad"})["total"] == 1

    now = datetime.now(timezone.utc)
    row = ("k", "u", "c", "Low", "m", "open", None, None, now)
    conn.execute = MagicMock(return_value=MagicMock(fetchall=MagicMock(return_value=[row])))
    ctx2 = Ctx(property_id=1)
    assert wf_mod.list_issue_workflow(conn, ctx2, {"status": "closed"})["count"] == 0
    assert wf_mod.list_issue_workflow(conn, ctx2, {"limit": "bad"})["count"] == 1

    with patch.object(Ctx, "load_gsc_links", return_value=None):
        assert bl_mod.get_gsc_links_summary(conn, Ctx(property_id=1), {})["missing"]


def test_health_list_history() -> None:
    conn = MagicMock()
    ctx = Ctx(property_id=1)
    with patch.object(Ctx, "resolve_property_domain", return_value=""):
        conn.execute = MagicMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))
        assert health_mod.list_report_history(conn, ctx, {})["count"] == 0
    with patch.object(Ctx, "load_payload", return_value={}):
        assert health_mod.get_health_history(conn, ctx, {"limit": "bad"})["count"] == 0


def test_issues_content_schema() -> None:
    conn = MagicMock()
    ctx = Ctx()
    with patch.object(Ctx, "load_payload", return_value={"categories": []}):
        assert issues_mod.get_category_issues(conn, ctx, {"category_id": "x"})["error"]
    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert schema_mod.get_schema_coverage(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_payload", return_value={}):
        assert content_mod.get_content_duplicates(conn, ctx, {"limit": "x"})["error"]


def test_misc_dispatch() -> None:
    conn = MagicMock()
    ctx = Ctx(property_id=None)
    assert dispatch_tool("get_integration_alerts", {}, context=ctx, conn=conn)["error"]
    with patch("website_profiling.tools.audit_tools.ops.check_all_alerts", return_value=[]):
        assert dispatch_tool("get_integration_alerts", {"property_id": 1}, context=Ctx(property_id=1), conn=conn)["count"] == 0


def test_remaining_module_paths() -> None:
    from website_profiling.tools.audit_tools import backlinks as bl
    from website_profiling.tools.audit_tools import links as links_mod
    from website_profiling.tools.audit_tools import content as ct
    from website_profiling.tools.audit_tools import indexation_tools as idx
    from website_profiling.tools.audit_tools import international as intl
    from website_profiling.tools.audit_tools import tech as tech_mod

    conn = MagicMock()
    ctx = Ctx(property_id=1)
    payload = {
        "orphan_urls": "bad",
        "top_pages": "bad",
        "outbound_link_domains": "bad",
        "url_fingerprints": "bad",
        "content_duplicates": "bad",
        "report_meta": {"a": 1},
        "site_level": {"robots": True},
        "indexation_coverage": None,
        "competitor_link_gap": None,
        "bing_backlinks": None,
        "crux_summary": None,
        "crawl_segments": None,
        "tech_stack_summary": None,
        "hreflang_summary": None,
        "language_summary": None,
        "content_analytics": None,
        "social_coverage": None,
        "keyword_opportunities": None,
        "ner_site_summary": None,
        "response_time_stats": None,
        "depth_distribution": None,
        "seo_health": None,
        "issues": {},
        "redirects": "bad",
        "security_findings": "bad",
        "keywords": {"rows": [1, 2]},
    }

    with patch.object(Ctx, "load_payload", return_value=payload):
        assert links_mod.list_orphan_pages(conn, ctx, {})["total"] == 0
        assert links_mod.get_top_linked_pages(conn, ctx, {})["total"] == 0
        assert links_mod.get_outbound_link_domains(conn, ctx, {})["total"] == 0
        assert links_mod.get_url_fingerprints(conn, ctx, {})["total"] == 0
        assert ct.get_content_duplicates(conn, ctx, {})["total"] in (0, 1)
        assert report_mod.get_report_meta(conn, ctx, {})["report_meta"]["a"] == 1
        assert report_mod.get_site_level(conn, ctx, {})["site_level"]["robots"] is True
        assert idx.get_indexation_coverage(conn, ctx, {})["missing"]
        assert bl.get_competitor_link_gap(conn, ctx, {})["missing"]
        assert bl.get_bing_backlinks_summary(conn, ctx, {})["missing"]
        assert crawl_mod.get_crawl_segments(conn, ctx, {})["missing"]
        assert tech_mod.get_tech_stack_summary(conn, ctx, {})["missing"]
        assert intl.get_hreflang_summary(conn, ctx, {})["missing"]
        assert intl.get_language_summary(conn, ctx, {})["missing"]
        assert ct.get_content_analytics(conn, ctx, {})["missing"]
        assert ct.get_social_coverage(conn, ctx, {})["missing"]
        assert ct.get_keyword_opportunities(conn, ctx, {})["missing"]
        assert ct.get_ner_site_summary(conn, ctx, {})["missing"]
        assert crawl_mod.get_response_time_stats(conn, ctx, {})["missing"]
        assert crawl_mod.get_depth_distribution(conn, ctx, {})["missing"]
        assert crawl_mod.get_seo_health(conn, ctx, {})["missing"]
        assert crawl_mod.list_redirects(conn, ctx, {})["total"] == 0
        assert crawl_mod.list_broken_links(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_keywords", return_value={"rows": "x"}):
        assert kw_mod.get_keyword_summary(conn, ctx, {})["total_keywords"] == 0

    with patch.object(Ctx, "load_google", return_value={"gsc": {"top_queries": "x"}}):
        assert google_mod.get_gsc_top_queries(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_google", return_value={"ga4": {}}):
        assert google_mod.get_ga4_summary(conn, ctx, {})["missing"]

    with patch.object(Ctx, "load_google", return_value={"gsc": {}, "ga4": {"summary": {}, "top_pages": "x"}}):
        assert google_mod.get_ga4_summary(conn, ctx, {})["top_pages"] == []

    lh_payload = {"lighthouse_summary": None, "lighthouse_diagnostics": "x", "lighthouse_by_url": "x", "crux_summary": {"ok": True}}
    with patch.object(Ctx, "load_payload", return_value=lh_payload), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_summary", return_value={"p": 1},
    ), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_page_summaries", return_value={"u": {"performance": 30}},
    ):
        assert lh_mod.get_lighthouse_summary(conn, ctx, {})["pages_audited"] == 1
        assert lh_mod.get_lighthouse_diagnostics(conn, ctx, {})["total"] == 0
        assert lh_mod.list_slow_pages(conn, ctx, {})["total"] == 0

    df = pd.DataFrame([{"url": "https://ex.com", "status": "200"}])
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        assert crawl_mod.search_pages(conn, ctx, {"status": "404", "limit": "bad"})["pages"] == []

    with patch.object(Ctx, "load_payload", return_value={"categories": [{"id": "x", "issues": []}]}):
        assert issues_mod.list_issues_by_category(conn, ctx, {"category_id": "x"})["total"] == 0

    with patch("website_profiling.tools.audit_tools.context.read_latest_keyword_data", return_value=None), patch.object(
        Ctx, "load_payload", return_value={"keywords": {"rows": []}},
    ):
        assert Ctx(property_id=1).load_keywords(conn) == {"rows": []}

    with patch("website_profiling.tools.audit_tools.context.read_latest_google_data", return_value=None), patch.object(
        Ctx, "load_payload", return_value={"google": {"gsc": {}}},
    ):
        assert Ctx(property_id=1).load_google(conn) == {"gsc": {}}

    # _slice branches
    assert _slice._parse_page_analysis({"page_analysis": 123}) == {}
    assert _slice._row_schema_types_list({"page_analysis": json.dumps({"json_ld_types": []})}) == []
    df2 = pd.DataFrame([{"url": "u", "status": "200", "has_schema": "yes", "page_analysis": "{}"}])
    assert _slice.crawl_filter(df2, has_schema=True)["total"] == 1

    from tests.db_test_fakes import FakeConn, FakeCursor
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    fake = FakeConn()
    fake.set_next_cursor(FakeCursor(fetchall_value=[(80, "{}", "{}", now, 1)]))
    hist = health_mod.get_health_history(fake, Ctx(property_id=1), {"limit": 99})
    assert hist["count"] == 1

    fake2 = FakeConn()
    fake2.set_next_cursor(FakeCursor(fetchall_value=[]))
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"):
        assert health_mod.list_report_history(fake2, Ctx(property_id=1), {"limit": "bad"})["count"] == 0

    assert bl.get_gsc_links_import_status(conn, Ctx(property_id=1), {})  # patched in expanded tests
    with patch("website_profiling.tools.audit_tools.backlinks.read_gsc_links_status", return_value={"hasData": False}):
        assert bl.get_gsc_links_import_status(conn, Ctx(property_id=1), {})["hasData"] is False


def test_new_tools_coverage() -> None:
    from website_profiling.tools.audit_tools import backlinks as bl_mod
    from website_profiling.tools.audit_tools import charts as charts_mod
    from website_profiling.tools.audit_tools import indexation_tools as idx_mod
    from website_profiling.tools.audit_tools import compare_helpers as ch_mod
    from website_profiling.tools.audit_tools import compare_slices as cs_mod
    from website_profiling.tools.audit_tools import onpage as onpage_mod
    from website_profiling.tools.audit_tools import ops as ops_mod
    from website_profiling.tools.audit_tools import report_extras as rex_mod
    from website_profiling.reporting.compare_payload import build_url_set_diff

    conn = MagicMock()
    ctx = Ctx(property_id=1, report_id=1)
    payload = {
        "summary": {"total_urls": 2},
        "recommendations": ["r1"],
        "ml_errors": ["e1"],
        "site_ssl_expires_at": "2027-01-01",
        "content_urls": {
            "missing_title": [{"url": "https://ex.com/a"}],
            "missing_h1": [],
            "multiple_h1": [],
            "missing_meta_desc": [],
            "meta_desc_short": [],
            "meta_desc_long": [],
            "thin_content": [],
        },
        "issues": {"seo": [{"type": "missing_title", "url": "https://ex.com/a", "message": "m"}]},
        "mime_labels": ["html"], "mime_values": [1],
        "title_labels": ["0"], "title_counts": [1],
        "domain_labels": ["ex.com"], "domain_values": [1],
        "outlink_labels": ["0"], "outlink_counts": [1],
        "top_pages": [{"url": "https://ex.com/"}],
        "links": [{"url": "https://ex.com/"}, {"url": "https://ex.com/new"}],
        "graph_edges": [[1, 2]],
        "graph_nodes": [1, 2],
        "indexation_coverage": {
            "lists": {"sitemap_only": ["https://ex.com/s"], "crawled_not_in_sitemap": [], "gsc_not_crawled": []},
            "lists_total": {"sitemap_only": 1},
            "url_join": [],
            "counts": {},
        },
        "categories": [
            {"id": "technical_seo", "name": "Tech", "score": 80, "issues": [{"llm_recommendation": "fix"}], "recommendations": ["rec"]},
        ],
        "lighthouse_human_summary": "summary text",
        "lighthouse_by_url": {"https://ex.com/bad": {"seo": 50, "performance": 40}},
    }
    df = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "404", "noindex": "true", "title": "", "word_count": 10, "fetch_method": "static", "page_analysis": json.dumps({"console_errors": ["e"]})},
        {"url": "https://ex.com/b", "status": "500", "noindex": "false", "title": "T", "word_count": 500, "fetch_method": "rendered", "page_analysis": "{}"},
    ])

    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert rex_mod.get_audit_recommendations(conn, ctx, {})["count"] == 1
        assert rex_mod.get_ml_errors(conn, ctx, {})["count"] == 1
        assert rex_mod.get_ssl_expiry_info(conn, ctx, {})["site_ssl_expires_at"]
        assert rex_mod.list_audit_categories(conn, ctx, {})["count"] == 1
        assert rex_mod.get_category_recommendations(conn, ctx, {"category_id": "technical_seo"})["recommendations"]
        assert rex_mod.list_issues_with_ai_fixes(conn, ctx, {})["total"] == 1
        assert onpage_mod.list_pages_missing_title(conn, ctx, {})["total"] == 1
        assert onpage_mod.list_pages_missing_h1(conn, ctx, {})["total"] == 0
        assert onpage_mod.list_pages_multiple_h1(conn, ctx, {})["total"] == 0
        assert onpage_mod.list_pages_missing_meta_description(conn, ctx, {})["total"] == 0
        assert onpage_mod.list_pages_meta_desc_too_short(conn, ctx, {})["total"] == 0
        assert onpage_mod.list_pages_meta_desc_too_long(conn, ctx, {})["total"] == 0
        assert onpage_mod.list_seo_onpage_issues(conn, ctx, {"issue_type": "missing_title"})["total"] == 1
        assert onpage_mod.list_pages_noindex(conn, ctx, {})["total"] == 1
        assert charts_mod.get_crawl_summary(conn, ctx, {})["summary"]["total_urls"] == 2
        assert charts_mod.get_mime_type_breakdown(conn, ctx, {})["items"]
        assert crawl_mod.list_status_4xx_pages(conn, ctx, {})["total"] == 1
        assert crawl_mod.list_status_5xx_pages(conn, ctx, {})["total"] == 1
        assert crawl_mod.get_page_analysis(conn, ctx, {"url": "https://ex.com/a"})["page_analysis"]
        assert crawl_mod.search_pages_advanced(conn, ctx, {"noindex_only": True})["total"] == 1
        assert crawl_mod.list_pages_with_console_errors(conn, ctx, {})["total"] == 1
        assert crawl_mod.list_pages_by_fetch_method(conn, ctx, {"fetch_method": "rendered"})["total"] == 1
        assert crawl_mod.get_crawl_links_table(conn, ctx, {})["total"] == 2
        assert crawl_mod.get_graph_edges_sample(conn, ctx, {})["total"] == 1
        assert lh_mod.get_lighthouse_human_summary(conn, ctx, {})["has_summary"]
        assert lh_mod.list_lighthouse_poor_seo_pages(conn, ctx, {})["total"] == 1

    with patch.object(Ctx, "load_payload", return_value=payload):
        assert idx_mod.list_indexation_gaps(conn, ctx, {"gap_type": "sitemap_only"})["total"] == 1
        assert idx_mod.get_indexation_url_join(conn, ctx, {})["url_join"] == []

    gsc = {"sample_links": [{"a": 1}], "latest_links": [{"b": 2}], "third_party_overlays": [{"provider": "moz"}], "sample_links_full_count": 1, "latest_links_full_count": 1}
    with patch.object(Ctx, "load_gsc_links", return_value=gsc):
        assert bl_mod.get_gsc_sample_links(conn, ctx, {})["links"]
        assert bl_mod.get_gsc_latest_links(conn, ctx, {})["links"]
        assert bl_mod.get_third_party_links_overlay(conn, ctx, {"provider": "moz"})["count"] == 1

    conn.execute = MagicMock(return_value=MagicMock(
        fetchall=MagicMock(return_value=[{"captured_at": datetime.now(timezone.utc), "referring_domains": 5, "top_domains": []}]),
        fetchone=MagicMock(return_value={"schedule_cron": "0 9 * * 1", "alert_webhook_url": "u", "alert_email": "a@b.com"}),
    ))
    with patch("website_profiling.tools.audit_tools.ops.get_property_by_id", return_value={"google_refresh_token": "t"}), patch.object(
        Ctx, "load_google", return_value={"fetched_at": "2026-01-01"},
    ), patch("website_profiling.integrations.google.gsc_links_store.read_gsc_links_status", return_value={"hasData": True}):
        assert ops_mod.get_property_ops(conn, ctx, {})["has_schedule"]
        assert ops_mod.get_google_integration_status(conn, ctx, {})["google_connected"]
        assert ops_mod.list_crawl_runs(conn, ctx, {})["count"] == 1
    conn.execute = MagicMock(return_value=MagicMock(
        fetchall=MagicMock(return_value=[{"id": 1, "filename": "log.txt", "line_count": 10, "uploaded_at": datetime.now(timezone.utc)}]),
        fetchone=MagicMock(return_value={"filename": "log.txt", "line_count": 10, "analysis": json.dumps({"top_paths": []}), "uploaded_at": datetime.now(timezone.utc)}),
    ))
    assert ops_mod.list_log_uploads(conn, ctx, {})["count"] == 1
    assert ops_mod.get_latest_log_analysis(conn, ctx, {})["analysis"] == {"top_paths": []}

    kw_data = {"rows": [{"keyword": "a", "gsc_position": 5, "gsc_impressions": 100, "recommended_action": "optimize page", "serp_estimated_competition": 0.5}], "serp_overlay_count": 1}
    with patch.object(Ctx, "load_keywords", return_value=kw_data):
        assert kw_mod.get_keyword_serp_overlay(conn, ctx, {})["keywords"]
        assert kw_mod.list_keywords_by_action(conn, ctx, {"recommended_action": "optimize page"})["total"] == 1
        assert kw_mod.list_keywords_by_position(conn, ctx, {"min_position": 1, "max_position": 10})["total"] == 1
        assert kw_mod.list_keywords_by_impressions(conn, ctx, {"min_impressions": 50})["total"] == 1

    with patch.object(Ctx, "load_google", return_value={"ga4": {"top_pages": [{"path": "/"}], "summary": {}}, "fetched_at": "x"}):
        assert google_mod.get_ga4_page_metrics(conn, ctx, {"path": "/"})["metrics"]

    from tests.db_test_fakes import FakeConn, FakeCursor
    fake = FakeConn()
    fake.set_next_cursor(FakeCursor(fetchall_value=[({"technical_seo": 80}, datetime.now(timezone.utc), 1, 75)]))
    assert health_mod.get_category_health_history(fake, Ctx(property_id=1), {"category_id": "technical_seo"})["count"] == 1

    cur_p = {"categories": [], "links": [{"url": "https://ex.com/new"}]}
    base_p = {"categories": [], "links": [{"url": "https://ex.com/old"}]}
    diff = build_url_set_diff(cur_p, base_p)
    assert diff["new_count"] >= 1

    def _read_pair(_conn: MagicMock, rid: int) -> dict:
        return cur_p if int(rid) == 1 else base_p

    with patch("website_profiling.tools.audit_tools.compare_helpers.read_report_payload", side_effect=_read_pair):
        assert cs_mod.compare_url_set_diff(conn, ctx, {"baseline_report_id": 2})["new_count"] >= 1
        assert cs_mod.compare_issue_deltas(conn, ctx, {"baseline_report_id": 2})["issue_deltas"] == []
        assert cs_mod.compare_category_deltas(conn, ctx, {"baseline_report_id": 2})["category_scores"] == []
        assert cs_mod.compare_seo_health_deltas(conn, ctx, {"baseline_report_id": 2})["seo_health_metrics"] == []
        assert cs_mod.compare_lighthouse_deltas(conn, ctx, {"baseline_report_id": 2})["lighthouse_url_deltas"] == []
        assert cs_mod.compare_redirect_deltas(conn, ctx, {"baseline_report_id": 2})["redirect_deltas"] == []
        assert cs_mod.compare_link_metric_deltas(conn, ctx, {"baseline_report_id": 2})["link_metric_deltas"] == []

    err = ch_mod.load_compare_pair(conn, ctx, {})
    assert err[4]["error"] == "baseline_report_id is required"
    with patch("website_profiling.tools.audit_tools.compare_helpers.read_report_payload", side_effect=[{"a": 1}, None]):
        err2 = ch_mod.load_compare_pair(conn, Ctx(report_id=1), {"baseline_report_id": 2})
        assert "not found" in err2[4]["error"]

    for fn in (cs_mod.compare_issue_deltas, cs_mod.compare_category_deltas, cs_mod.compare_seo_health_deltas,
               cs_mod.compare_lighthouse_deltas, cs_mod.compare_redirect_deltas, cs_mod.compare_link_metric_deltas):
        assert fn(conn, ctx, {})["error"]

    bl_conn = MagicMock()
    bl_conn.execute = MagicMock(return_value=MagicMock(
        fetchall=MagicMock(return_value=[{"captured_at": datetime.now(timezone.utc), "referring_domains": 3, "top_domains": []}]),
    ))
    assert bl_mod.get_backlinks_velocity(bl_conn, ctx, {})["count"] == 1

    err_base = ch_mod.load_compare_pair(conn, ctx, {"baseline_report_id": "x"})
    assert err_base[4]["error"] == "invalid baseline_report_id"
    conn_no_cur = MagicMock()
    conn_no_cur.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value=None)))
    err_cur = ch_mod.load_compare_pair(conn_no_cur, Ctx(report_id=None), {"baseline_report_id": 2})
    assert "no current" in err_cur[4]["error"]

    with patch.object(Ctx, "load_payload", return_value={}):
        assert charts_mod.get_crawl_summary(conn, ctx, {})["error"]
        assert onpage_mod.list_content_url_issues(conn, ctx, {"bucket": "missing_title"})["error"]

    # error branches
    assert onpage_mod.list_content_url_issues(conn, ctx, {"bucket": "bad"})["error"]
    assert rex_mod.get_category_recommendations(conn, ctx, {})["error"]
    assert ops_mod.get_property_ops(conn, Ctx(property_id=None), {})["error"]
    assert ops_mod.list_log_uploads(conn, Ctx(property_id=None), {})["error"]
    assert bl_mod.get_gsc_sample_links(conn, Ctx(property_id=None), {})["error"]
    assert kw_mod.list_keywords_by_action(conn, ctx, {})["error"]
    assert kw_mod.list_keywords_by_impressions(conn, ctx, {"min_impressions": "x"})["error"]
    assert crawl_mod.list_pages_by_fetch_method(conn, ctx, {})["error"]
    assert crawl_mod.get_page_analysis(conn, ctx, {"url": ""})["error"]
    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert onpage_mod.list_pages_noindex(conn, ctx, {})["pages"] == []

    with patch.object(Ctx, "load_payload", return_value={}):
        for fn, mod in (
            (charts_mod.get_mime_type_breakdown, charts_mod),
            (charts_mod.get_title_length_distribution, charts_mod),
            (charts_mod.get_domain_link_distribution, charts_mod),
            (charts_mod.get_outlink_distribution, charts_mod),
            (charts_mod.get_top_crawled_pages, charts_mod),
        ):
            assert fn(conn, ctx, {})["error"]

    with patch.object(Ctx, "load_payload", return_value={"mime_labels": "x", "mime_values": 1}):
        assert charts_mod.get_mime_type_breakdown(conn, ctx, {})["items"] == []
    with patch.object(Ctx, "load_payload", return_value={"title_labels": None, "title_counts": []}):
        assert charts_mod.get_title_length_distribution(conn, ctx, {})["items"] == []
    with patch.object(Ctx, "load_payload", return_value={"domain_labels": None, "domain_values": []}):
        assert charts_mod.get_domain_link_distribution(conn, ctx, {})["items"] == []
    with patch.object(Ctx, "load_payload", return_value={"top_pages": "x"}):
        assert charts_mod.get_top_crawled_pages(conn, ctx, {})["total"] == 0

    conn_rid = MagicMock()
    conn_rid.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value={"id": 7})))
    with patch("website_profiling.tools.audit_tools.compare_helpers.read_report_payload", side_effect=[{"links": []}, {"links": []}]):
        ok = ch_mod.load_compare_pair(conn_rid, Ctx(report_id=None), {"baseline_report_id": 2})
        assert ok[4] is None
        assert ok[2] == 7

    assert cs_mod.compare_url_set_diff(conn, ctx, {})["error"]

    with patch.object(Ctx, "load_keywords", return_value=None):
        assert kw_mod.get_keyword_serp_overlay(conn, ctx, {})["error"]
        assert kw_mod._filter_keyword_rows(conn, ctx, {}, lambda r: True)["error"]

    with patch.object(Ctx, "load_google", return_value={"ga4": {"top_pages": []}}):
        assert google_mod.get_ga4_page_metrics(conn, ctx, {"path": "/missing"})["missing"]

    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert crawl_mod.search_pages_advanced(conn, ctx, {"missing_title": True})["total"] == 1
        assert crawl_mod.search_pages_advanced(conn, ctx, {"max_word_count": 50})["total"] == 1

    with patch.object(Ctx, "load_payload", return_value={}):
        assert idx_mod.list_indexation_gaps(conn, ctx, {"gap_type": "bad"})["error"]
        assert rex_mod.list_issues_with_ai_fixes(conn, ctx, {})["error"]

    ops_conn = MagicMock()
    ops_conn.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value=None)))
    assert ops_mod.get_property_ops(ops_conn, ctx, {})["error"] == "property not found"
    assert ops_mod.get_latest_log_analysis(ops_conn, ctx, {})["missing"]

    with patch("website_profiling.tools.audit_tools.ops.get_property_by_id", return_value=None):
        assert ops_mod.get_google_integration_status(conn, ctx, {})["error"] == "property not found"

    with patch.object(Ctx, "load_gsc_links", return_value=None):
        assert bl_mod.get_gsc_latest_links(conn, ctx, {})["missing"]
        assert bl_mod.get_third_party_links_overlay(conn, ctx, {})["missing"]

    with patch.object(Ctx, "load_payload", return_value={"content_urls": "bad"}):
        assert onpage_mod.list_pages_missing_title(conn, ctx, {})["missing"]

    fake_h = FakeConn()
    fake_h.set_next_cursor(FakeCursor(fetchall_value=[('{"technical_seo": 70}', datetime.now(timezone.utc), 2, 72)]))
    assert health_mod.get_category_health_history(fake_h, Ctx(property_id=1), {})["count"] == 1
    fake_h2 = FakeConn()
    fake_h2.set_next_cursor(FakeCursor(fetchall_value=[("not-json", datetime.now(timezone.utc), 2, 72)]))
    assert health_mod.get_category_health_history(fake_h2, Ctx(property_id=1), {"category_id": "technical_seo"})["count"] == 1

    with patch.object(Ctx, "load_payload", return_value={"lighthouse_human_summary": "", "lighthouse_summary": {"human_summary": "from summary"}}):
        assert lh_mod.get_lighthouse_human_summary(conn, ctx, {})["has_summary"]

    assert ch_mod._row_id({"id": 9}) == 9
    assert ch_mod._row_id((8,)) == 8
    with patch("website_profiling.tools.audit_tools.compare_helpers.read_report_payload", return_value=None):
        err_cur_only = ch_mod.load_compare_pair(conn, Ctx(report_id=3), {"baseline_report_id": 2})
        assert "not found" in err_cur_only[4]["error"]

    with patch.object(Ctx, "load_payload", return_value={"crawl_run_id": 1}), patch(
        "website_profiling.db.crawl_store.read_edges",
        return_value=[("https://ex.com/b", "https://ex.com/a")],
    ):
        links = crawl_mod.get_internal_links(conn, ctx, {"url": "https://ex.com/a"})
        assert links["inlink_count"] == 1

    with patch.object(Ctx, "load_crawl_df", return_value=None):
        assert crawl_mod.search_pages(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_payload", return_value=payload):
        assert rex_mod.get_audit_recommendations(conn, ctx, {})["count"] == 1
        assert rex_mod.get_category_recommendations(conn, ctx, {"category_id": "nope"})["error"]
        assert rex_mod.list_audit_categories(conn, ctx, {})["count"] == 1

    kw_bad = {"rows": [{"keyword": "x", "gsc_position": "bad"}]}
    with patch.object(Ctx, "load_keywords", return_value=kw_bad):
        assert kw_mod.list_keywords_by_position(conn, ctx, {"min_position": 1})["total"] == 0

    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "x", "recommended_action": "x"}]}):
        assert kw_mod.list_keywords_by_action(conn, ctx, {"recommended_action": "missing"})["total"] == 0
    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "x", "gsc_impressions": "12.5"}]}):
        assert kw_mod.list_keywords_by_impressions(conn, ctx, {"min_impressions": 12})["total"] == 1

    with patch.object(Ctx, "load_payload", return_value={}):
        assert idx_mod.list_indexation_gaps(conn, ctx, {"gap_type": "sitemap_only"})["error"]
        assert idx_mod.get_indexation_url_join(conn, ctx, {})["error"]

    ops_row = MagicMock()
    ops_row.keys = MagicMock(return_value=["schedule_cron", "alert_webhook_url", "alert_email"])
    ops_conn3 = MagicMock()
    ops_conn3.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value=ops_row)))
    with patch("website_profiling.tools.audit_tools.ops._row_field", side_effect=lambda row, key, index=0: (
        None, "https://hooks.example/alerts", None
    )[index]):
        ops = ops_mod.get_property_ops(ops_conn3, ctx, {})
        assert ops["has_alert_webhook"] is True
        assert ops["has_schedule"] is False

    with patch("website_profiling.tools.audit_tools.ops.get_property_by_id", return_value={"google_refresh_token": "t"}), patch(
        "website_profiling.integrations.google.gsc_links_store.read_gsc_links_status", side_effect=RuntimeError("db"),
    ), patch.object(Ctx, "load_google", return_value={}):
        status = ops_mod.get_google_integration_status(conn, ctx, {})
        assert status["gsc_links"] is None

    with patch.object(Ctx, "load_payload", return_value={"categories": ["bad"]}):
        assert rex_mod.list_issues_with_ai_fixes(conn, ctx, {})["total"] == 0

    df_no_col = pd.DataFrame([{"url": "https://ex.com/z", "status": "200"}])
    with patch.object(Ctx, "load_crawl_df", return_value=df_no_col):
        assert onpage_mod.list_pages_noindex(conn, ctx, {})["note"]

    with patch.object(Ctx, "load_payload", return_value={"issues": {"seo": "bad"}}):
        assert onpage_mod.list_seo_onpage_issues(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_crawl_df", return_value=df), patch.object(Ctx, "load_payload", return_value=payload):
        assert crawl_mod.get_page_analysis(conn, ctx, {"url": "https://ex.com/missing"})["error"]

    with patch.object(Ctx, "load_payload", return_value={"recommendations": "x"}):
        assert rex_mod.get_audit_recommendations(conn, ctx, {})["count"] == 0
    with patch.object(Ctx, "load_payload", return_value={"ml_errors": None}):
        assert rex_mod.get_ml_errors(conn, ctx, {})["count"] == 0
    with patch.object(Ctx, "load_payload", return_value={"categories": [{"id": "x", "recommendations": "x"}]}):
        assert rex_mod.get_category_recommendations(conn, ctx, {"category_id": "x"})["recommendations"] == []

    log_conn = MagicMock()
    log_conn.execute = MagicMock(return_value=MagicMock(
        fetchone=MagicMock(return_value={"filename": "a.log", "line_count": 1, "analysis": "not-json", "uploaded_at": datetime.now(timezone.utc)}),
    ))
    assert ops_mod.get_latest_log_analysis(log_conn, ctx, {})["analysis"] == {}

    with patch.object(Ctx, "load_payload", return_value={"indexation_coverage": {"lists": {}, "counts": {}}}):
        assert idx_mod.get_indexation_url_join(conn, ctx, {})["missing"]

    with patch.object(Ctx, "load_payload", return_value={"indexation_coverage": {"lists": {"sitemap_only": "bad"}, "lists_total": {}}}):
        assert idx_mod.list_indexation_gaps(conn, ctx, {"gap_type": "sitemap_only"})["total"] == 0

    with patch.object(Ctx, "load_gsc_links", return_value={"third_party_overlays": "bad"}):
        assert bl_mod.get_third_party_links_overlay(conn, ctx, {})["count"] == 0

    bl_conn2 = MagicMock()
    bl_conn2.execute = MagicMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))
    assert bl_mod.get_backlinks_velocity(bl_conn2, ctx, {})["count"] == 0

    with patch.object(Ctx, "load_google", return_value={"ga4": {"top_pages": []}, "fetched_at": "t"}), patch(
        "website_profiling.tools.audit_tools.google.slice_from_google_row", return_value={"ga4": {"sessions": 3}},
    ):
        assert google_mod.get_ga4_page_metrics(conn, ctx, {"path": "/x"})["metrics"]["sessions"] == 3

    df_err = pd.DataFrame([{"url": "https://ex.com/e", "status": "200", "page_analysis": json.dumps({"console_errors": "single"})}])
    with patch.object(Ctx, "load_crawl_df", return_value=df_err):
        assert crawl_mod.list_pages_with_console_errors(conn, ctx, {})["total"] == 1

    fake_h3 = FakeConn()
    fake_h3.set_next_cursor(FakeCursor(fetchall_value=[(80, "bad-json", "also-bad", datetime.now(timezone.utc), 1)]))
    assert health_mod.get_health_history(fake_h3, Ctx(property_id=1), {})["count"] == 1


def test_all_tools_empty_payload() -> None:
    """Hit 'no report found' branches across payload-backed tools."""
    conn = MagicMock()
    ctx = Ctx(property_id=1)
    empty_tools = [
        "get_executive_summary", "get_report_meta", "get_site_level", "list_redirects",
        "list_broken_links", "get_status_code_breakdown", "get_response_time_stats",
        "get_depth_distribution", "get_crawl_segments", "get_browser_diagnostics_summary",
        "get_seo_health", "list_orphan_pages", "get_top_linked_pages", "get_outbound_link_domains",
        "get_link_graph_summary", "get_url_fingerprints", "get_indexation_coverage",
        "get_hreflang_summary", "get_language_summary", "get_content_analytics",
        "get_content_duplicates", "get_social_coverage", "get_keyword_opportunities",
        "get_ner_site_summary", "list_thin_content_pages", "get_semantic_keyword_clusters",
        "get_competitor_link_gap", "get_bing_backlinks_summary", "get_lighthouse_diagnostics",
        "get_crux_summary", "get_tech_stack_summary", "get_security_findings",
        "get_category_issues",
        "get_audit_recommendations", "get_ml_errors", "get_ssl_expiry_info",
        "list_audit_categories", "get_category_recommendations", "list_issues_with_ai_fixes",
        "list_seo_onpage_issues", "list_content_url_issues", "list_pages_missing_title",
        "get_crawl_summary", "get_mime_type_breakdown", "list_indexation_gaps",
        "get_indexation_url_join", "get_lighthouse_human_summary", "get_crawl_links_table",
        "get_graph_edges_sample", "compare_issue_deltas",
    ]
    with patch.object(Ctx, "load_payload", return_value={}):
        for name in empty_tools:
            result = dispatch_tool(name, {"property_id": 1, "category_id": "x"}, context=ctx, conn=conn)
            assert "error" in result, name
