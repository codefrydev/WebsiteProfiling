"""Line-coverage tests for audit_tools dispatch handlers."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from website_profiling.tools.audit_tools import dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx


@pytest.fixture
def ctx() -> Ctx:
    return Ctx(property_id=1, report_id=1)


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


def _payload() -> dict:
    return {
        "site_name": "Example",
        "report_generated_at": "2026-06-07T12:00:00Z",
        "categories": [{"id": "tech", "name": "Tech", "score": 80, "issues": []}],
        "executive_summary": {"headline": "OK"},
        "content_urls": {
            "missing_canonical": [{"url": "https://ex.com/no-canonical"}],
            "canonical_mismatch": [{"url": "https://ex.com/m", "canonical_url": "https://ex.com/other"}],
            "missing_alt": [{"url": "https://ex.com/alt"}],
        },
        "social_coverage": {"og_image_missing": ["https://ex.com/no-og"]},
        "top_pages": [{"url": "https://ex.com/", "pagerank": 0.9, "inlinks": 3}],
        "content_analytics": {"thin_pages": [{"url": "https://ex.com/thin", "word_count": 50}]},
        "content_duplicates": [
            {
                "representative_url": "https://ex.com/dup",
                "member_urls": ["https://ex.com/dup", "https://ex.com/dup2"],
            },
        ],
        "lighthouse_by_url": {
            "https://ex.com/slow": {
                "performance": 30,
                "seo": 70,
                "accessibility": 60,
                "best-practices": 55,
                "scores": {"performance": 30, "seo": 70},
            },
            "https://ex.com/ok": {"performance": 90, "seo": 95},
        },
        "lighthouse_diagnostics": [
            {"lighthouse_audit_id": "uses-optimized-images", "title": "Images", "url": "https://ex.com"},
            {"bad": True},
        ],
        "crux_summary": {"available": True},
        "tech_stack_summary": {"technologies": [{"name": "React", "sample_urls": ["https://ex.com/app"]}]},
    }


def test_crawl_lists_paths(conn: MagicMock, ctx: Ctx) -> None:
    df = pd.DataFrame([
        {
            "url": "https://ex.com/a",
            "status": "200",
            "canonical_url": "",
            "images_without_alt": 2,
            "heading_sequence": "h1,h4",
            "viewport_present": "false",
            "redirect_chain_length": 5,
            "og_image": "",
            "tech_stack": '["Vue"]',
        },
        {
            "url": "https://ex.com/mismatch",
            "status": "200",
            "canonical_url": "https://ex.com/canonical",
            "images_without_alt": 0,
            "heading_sequence": "h1",
            "viewport_present": "true",
            "redirect_chain_length": 0,
            "og_image": "https://ex.com/og.png",
            "tech_stack": "[]",
        },
        {"url": "https://ex.com/b", "status": "blocked_by_robots"},
        {"url": "https://ex.com/c", "status": "404"},
    ])
    payload = _payload()
    payload.pop("content_urls")
    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert dispatch_tool("list_pages_missing_canonical", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_canonical_mismatch", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_pages_with_missing_alt", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_robots_blocked_urls", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_pages_by_technology", {"technology_name": "Vue"}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_pages_by_technology", {}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("get_top_pages_by_pagerank", {}, context=ctx, conn=conn)["total"] == 1

    with patch.object(Ctx, "load_payload", return_value={"content_urls": "bad"}):
        assert dispatch_tool("list_pages_missing_canonical", {}, context=ctx, conn=conn)["missing"]
    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame([{
        "url": "https://ex.com/h", "status": "200", "heading_sequence": "h1,h4",
    }])):
        assert dispatch_tool("list_pages_skipped_headings", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_canonical_mismatch", {}, context=ctx, conn=conn)["total"] == 0

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert dispatch_tool("list_pages_missing_viewport", {}, context=ctx, conn=conn)["note"]


def test_content_and_lighthouse_paths(conn: MagicMock, ctx: Ctx) -> None:
    payload = _payload()
    with patch.object(Ctx, "load_payload", return_value=payload):
        thin = dispatch_tool("list_thin_content_pages", {}, context=ctx, conn=conn)
        assert thin["total"] == 1
        by_url = dispatch_tool(
            "get_duplicate_cluster",
            {"url": "https://ex.com/dup2"},
            context=ctx,
            conn=conn,
        )
        assert by_url["cluster_index"] == 0
        assert dispatch_tool("get_duplicate_cluster", {"cluster_index": 99}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("get_duplicate_cluster", {"cluster_index": "x"}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("get_duplicate_cluster", {"url": "https://ex.com/none"}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("get_duplicate_cluster", {}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("get_crux_summary", {}, context=ctx, conn=conn)["data"]["available"] is True
        assert dispatch_tool("get_lighthouse_for_url", {"url": "https://ex.com/slow"}, context=ctx, conn=conn)["lighthouse"]
        assert dispatch_tool("get_lighthouse_for_url", {}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("list_slow_pages", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("get_issue_priority_breakdown", {}, context=ctx, conn=conn).get("items") is not None

    thin_count_payload = {"seo_health": {"thin_content": 3}}
    with patch.object(Ctx, "load_payload", return_value=thin_count_payload):
        note = dispatch_tool("list_thin_content_pages", {}, context=ctx, conn=conn)
        assert note["total"] == 3
        assert note.get("note")

    lh_payload = {
        "lighthouse_summary": {"human_summary": "text", "pages_audited": 1},
        "lighthouse_by_url": {
            "https://ex.com/x": {
                "category_scores": {"accessibility": 40},
                "median_metrics": {"best-practices": 45},
            },
        },
    }
    with patch.object(Ctx, "load_payload", return_value=lh_payload), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_page_summaries",
        return_value={"https://ex.com/x": {"performance": 40, "scores": {"performance": 40}}},
    ), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_summary",
        return_value={"human_summary": "db"},
    ):
        summary = dispatch_tool("get_lighthouse_summary", {}, context=ctx, conn=conn)
        assert summary["pages_audited"] >= 1
        assert dispatch_tool("list_lighthouse_poor_accessibility_pages", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_lighthouse_poor_best_practices_pages", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_lighthouse_cwv_failures", {}, context=ctx, conn=conn)["total"] >= 0


def test_compare_slices_and_llm(conn: MagicMock, ctx: Ctx) -> None:
    payload = _payload()
    with patch("website_profiling.tools.audit_tools.compare_helpers.read_report_payload", return_value=payload):
        for name in (
            "compare_duplicate_deltas",
            "compare_tech_deltas",
            "compare_content_metrics",
            "compare_google_metrics",
            "compare_priority_counts",
        ):
            result = dispatch_tool(name, {"baseline_report_id": 1}, context=ctx, conn=conn)
            assert "error" not in result, name

    with patch("website_profiling.tools.audit_tools.llm_tools.run_page_coach", return_value={"coach": "ok"}):
        assert dispatch_tool("get_page_coach", {"url": "https://ex.com"}, context=ctx, conn=conn)["coach"] == "ok"
    assert dispatch_tool("get_page_coach", {}, context=ctx, conn=conn)["error"]
    assert dispatch_tool("generate_content_brief", {}, context=ctx, conn=conn)["error"]
    assert dispatch_tool("expand_keywords", {}, context=ctx, conn=conn)["error"]
    assert dispatch_tool("expand_keywords", {"seeds": []}, context=ctx, conn=conn)["error"]

    kw_rows = {"rows": [{"keyword": "widgets sale", "gsc_position": 5}]}
    with patch.object(Ctx, "load_keywords", return_value=kw_rows):
        brief = dispatch_tool("generate_content_brief", {"keyword": "widgets", "gaps": ["gap"]}, context=ctx, conn=conn)
        assert brief["matched_rows"] == 1

    with patch("website_profiling.tools.audit_tools.llm_tools.batch_expand", return_value={}), patch.object(
        Ctx, "load_keywords", return_value=None,
    ):
        expanded = dispatch_tool(
            "expand_keywords",
            {"seeds": "a, b", "sources": ["web"]},
            context=ctx,
            conn=conn,
        )
        assert expanded["seed_count"] == 2

    conn.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value={
        "health_score": 70,
        "generated_at": datetime.now(timezone.utc),
        "report_id": 1,
        "issue_counts": json.dumps({"High": 2}),
    })))
    with patch("website_profiling.tools.audit_tools.llm_tools.list_properties_public", return_value=[{"id": 1, "name": "Ex"}]):
        portfolio = dispatch_tool("get_portfolio_summary", {}, conn=conn)
        assert portfolio["count"] == 1
        assert portfolio["properties"][0]["issue_counts"]["High"] == 2


def test_ops_log_paths(conn: MagicMock, ctx: Ctx) -> None:
    assert dispatch_tool("get_log_analysis_by_id", {}, context=ctx, conn=conn)["error"]
    assert dispatch_tool("get_log_top_paths", {}, context=Ctx(property_id=None), conn=conn)["error"]
    assert dispatch_tool("get_latest_log_analysis", {}, context=Ctx(property_id=None), conn=conn)["error"]
    assert dispatch_tool("get_google_integration_status", {}, context=Ctx(property_id=None), conn=conn)["error"]

    conn.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value=None)))
    assert dispatch_tool("get_log_analysis_by_id", {"upload_id": 9}, context=ctx, conn=conn)["error"]
    assert dispatch_tool("get_log_analysis_by_id", {"upload_id": "x"}, context=ctx, conn=conn)["error"]

    log_row = {
        "upload_id": 1,
        "filename": "access.log",
        "line_count": 10,
        "analysis": {"top_paths": [{"path": "/"}], "parsed_lines": 10, "googlebot_hits": 2},
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    }
    with patch("website_profiling.tools.audit_tools.ops._load_log_analysis", return_value=log_row):
        assert dispatch_tool("get_log_analysis_by_id", {"upload_id": 1}, context=ctx, conn=conn)["upload_id"] == 1
        assert dispatch_tool("get_latest_log_analysis", {}, context=ctx, conn=conn)["filename"] == "access.log"
        assert dispatch_tool("get_log_top_paths", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("list_log_only_paths", {}, context=ctx, conn=conn)["total"] == 0
        assert dispatch_tool("list_crawl_only_paths", {}, context=ctx, conn=conn)["total"] == 0
        assert dispatch_tool("get_log_googlebot_stats", {}, context=ctx, conn=conn)["googlebot_hits"] == 2

    with patch("website_profiling.tools.audit_tools.ops._load_log_analysis", return_value=None):
        assert dispatch_tool("get_log_top_paths", {}, context=ctx, conn=conn)["missing"]


def test_tech_lighthouse_charts_keywords(conn: MagicMock, ctx: Ctx) -> None:
    from website_profiling.tools.audit_tools import tech as tech_mod
    from website_profiling.tools.audit_tools import lighthouse as lh_mod

    assert tech_mod.list_pages_by_technology(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_payload", return_value={}):
        assert tech_mod.list_pages_by_technology(conn, ctx, {"technology_name": "x"})["error"]

    summary_payload = {
        "tech_stack_summary": {
            "technologies": [
                "bad",
                {"name": "Next.js", "sample_urls": ["https://ex.com/n"]},
            ],
        },
    }
    df = pd.DataFrame([
        {"url": "https://ex.com/p", "status": "200", "tech_stack": '["next.js"]'},
    ])
    with patch.object(Ctx, "load_payload", return_value=summary_payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        from_summary = tech_mod.list_pages_by_technology(conn, ctx, {"technology_name": "Next.js"})
        assert from_summary["total"] == 1
        summary_payload["tech_stack_summary"] = {"technologies": []}
        from_crawl = tech_mod.list_pages_by_technology(conn, ctx, {"technology_name": "next.js"})
        assert from_crawl["total"] == 1

    lh_data = {
        "lighthouse_summary": {"human_summary": "ok"},
        "lighthouse_diagnostics": [],
        "lighthouse_by_url": {
            "https://ex.com/a": {"performance": 20, "scores": {"performance": 20}},
            "https://ex.com/b": {"seo": 50, "category_scores": {"seo": 50}},
        },
        "lighthouse_human_summary": "inline",
    }
    with patch.object(Ctx, "load_payload", return_value=lh_data), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_page_summaries",
        return_value={"https://ex.com/a": {"performance": 20}},
    ), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_summary",
        return_value={"human_summary": "db"},
    ):
        out = lh_mod.get_lighthouse_summary(conn, ctx, {})
        assert out["poor_performance_pages"]
        assert lh_mod.get_lighthouse_for_url(conn, ctx, {"url": ""})["error"]
        assert lh_mod.get_lighthouse_for_url(conn, ctx, {"url": "https://ex.com/b"})["lighthouse"]
        assert lh_mod.list_slow_pages(conn, ctx, {})["total"] >= 1
        assert lh_mod.list_lighthouse_poor_seo_pages(conn, ctx, {})["total"] >= 1

    score_payload = {
        "lighthouse_by_url": {
            "https://ex.com/c": {
                "scores": {"accessibility": 30},
                "median_metrics": {"best-practices": 40},
            },
        },
    }
    with patch.object(Ctx, "load_payload", return_value=score_payload):
        assert lh_mod.list_lighthouse_poor_accessibility_pages(conn, ctx, {})["total"] >= 1
        assert lh_mod.list_lighthouse_poor_best_practices_pages(conn, ctx, {})["total"] >= 1
        assert lh_mod.list_lighthouse_cwv_failures(conn, ctx, {})["total"] >= 0

    with patch("website_profiling.tools.audit_tools.report.get_report_summary", return_value={
        "issue_counts": {"Critical": 2, "High": 1, "bad": "x"},
        "total_issues": 3,
        "health_score": 70,
    }):
        breakdown = dispatch_tool("get_issue_priority_breakdown", {}, context=ctx, conn=conn)
        assert breakdown["items"]

    kw_payload = {
        "rows": [
            "bad",
            {"keyword": "x", "recommended_action": "fix", "gsc_position": 3, "gsc_impressions": 100},
        ],
        "striking_distance": [{"keyword": "y"}],
        "cannibalisation": [{"keyword": "z"}],
        "query_page_misalignment": [{"keyword": "q"}],
        "serp_overlay_count": 1,
    }
    with patch.object(Ctx, "load_keywords", return_value=kw_payload), patch(
        "website_profiling.tools.audit_tools.keywords.read_keyword_history",
        return_value=[{"keyword": "x", "position": 4}],
    ):
        assert dispatch_tool("get_striking_distance_keywords", {}, context=ctx, conn=conn)["keywords"]
        assert dispatch_tool("search_keywords", {"query": "x"}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("get_keyword_summary", {"limit": "bad"}, context=ctx, conn=conn)["total_keywords"] >= 1
        assert dispatch_tool("get_keyword_cannibalisation", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("get_query_page_misalignment", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("get_keyword_history", {"keyword": "x"}, context=ctx, conn=conn)["count"] == 1
    with patch.object(Ctx, "load_keywords", return_value=None):
        assert dispatch_tool("get_keyword_summary", {}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("search_keywords", {"query": "x"}, context=ctx, conn=conn)["error"]

    img_payload = _payload()
    img_payload["links"] = [
        {
            "url": "https://ex.com/",
            "og_image": "https://cdn.ex.com/og.png",
            "twitter_image": "https://cdn.ex.com/tw.png",
            "page_analysis": {"image_urls": ["https://cdn.ex.com/hero.jpg", "https://cdn.ex.com/hero.jpg"]},
        },
        "bad",
    ]
    img_payload["image_inventory"] = [
        {"url": "https://cdn.ex.com/big.png", "size_bytes": 500_000, "content_type": "image/png", "source_pages": [], "kinds": []},
    ]
    img_payload["image_inventory_summary"] = {"unoptimized_min_kb": 200}
    with patch.object(Ctx, "load_payload", return_value=img_payload):
        twitter = dispatch_tool("list_site_image_urls", {"kind": "twitter"}, context=ctx, conn=conn)
        assert twitter["total"] == 1
        largest = dispatch_tool("list_largest_images", {"min_size_kb": "bad"}, context=ctx, conn=conn)
        assert largest["inventory_available"] is True
        assert largest["min_size_kb"] == 200

    bad_tech_df = pd.DataFrame([{"url": "https://ex.com/t", "status": "200", "tech_stack": "not-json"}])
    with patch.object(Ctx, "load_payload", return_value={"tech_stack_summary": {"technologies": []}}), patch.object(
        Ctx, "load_crawl_df", return_value=bad_tech_df,
    ):
        assert tech_mod.list_pages_by_technology(conn, ctx, {"technology_name": "vue"})["total"] == 0


def test_security_google_lighthouse_and_portfolio(conn: MagicMock, ctx: Ctx, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    sec_payload = {
        "security_findings": [
            "bad",
            {"severity": "High", "finding_type": "hsts", "message": "m"},
            {"severity": "Low", "finding_type": "csp", "message": "n"},
        ],
    }
    with patch.object(Ctx, "load_payload", return_value=sec_payload):
        assert dispatch_tool("get_security_findings", {"severity": "high"}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("get_security_findings_summary", {}, context=ctx, conn=conn)["type_count"] == 2
        assert dispatch_tool("list_security_findings_by_type", {}, context=ctx, conn=conn)["error"]
    with patch.object(Ctx, "load_payload", return_value={"security_findings": "bad"}):
        assert dispatch_tool("get_security_findings", {}, context=ctx, conn=conn)["total"] == 0
        assert dispatch_tool("get_security_findings_summary", {}, context=ctx, conn=conn)["total_findings"] == 0
        assert dispatch_tool("list_security_findings_by_type", {"finding_type": "x"}, context=ctx, conn=conn)["total"] == 0

    google_data = {
        "gsc": {"top_queries": [{"query": "q"}], "top_pages": [{"page": "/"}]},
        "ga4": {"summary": {"sessions": 1}, "top_pages": [{"path": "/home", "sessions": 5}]},
        "fetched_at": "2026-01-01",
    }
    assert dispatch_tool("search_keywords", {"query": "x"}, context=Ctx(property_id=None), conn=conn)["error"]
    with patch.object(Ctx, "load_google", return_value=None):
        assert dispatch_tool("get_gsc_top_pages", {}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("get_gsc_page_query_slice", {"url": "https://ex.com"}, context=ctx, conn=conn)["error"]
    with patch.object(Ctx, "load_google", return_value=google_data), patch(
        "website_profiling.tools.audit_tools.google.slice_from_google_row",
        return_value={"gsc": {"clicks": 1}, "ga4": {"sessions": 2}},
    ):
        assert dispatch_tool("get_gsc_top_pages", {}, context=ctx, conn=conn)["total"] == 1
        assert dispatch_tool("get_ga4_summary", {}, context=ctx, conn=conn)["top_pages"]
        assert dispatch_tool("get_gsc_page_query_slice", {"url": "https://ex.com/home"}, context=ctx, conn=conn)["gsc_ga4"]
        assert dispatch_tool("get_ga4_page_metrics", {"path": "https://ex.com/home"}, context=ctx, conn=conn)["metrics"]["sessions"] == 5
        assert dispatch_tool("get_ga4_page_metrics", {"path": "/missing"}, context=ctx, conn=conn)["metrics"]["sessions"] == 2

    lh_payload = {
        "lighthouse_by_url": {
            "bad": "skip",
            "https://ex.com/cwv": {
                "median_metrics": {"lcp_ms": 5000, "cls": 0.5, "tbt_ms": 500},
                "category_scores": {"accessibility_score": 30},
                "scores": {"best_practices": 40},
            },
            "https://ex.com/score": {
                "scores": {"performance": "n/a"},
                "category_scores": {"seo": 70},
                "median_metrics": {"cumulative_layout_shift": 0.1},
            },
        },
    }
    with patch.object(Ctx, "load_payload", return_value=lh_payload):
        assert dispatch_tool("list_lighthouse_cwv_failures", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_lighthouse_poor_accessibility_pages", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("list_lighthouse_poor_best_practices_pages", {}, context=ctx, conn=conn)["total"] >= 1
        assert dispatch_tool("get_lighthouse_diagnostics", {}, context=ctx, conn=conn)["total"] == 0
        assert dispatch_tool("get_crux_summary", {}, context=ctx, conn=conn)["missing"]

    kw_rows = {"rows": [{"keyword": "a", "gsc_position": 5, "gsc_impressions": 10}]}
    with patch.object(Ctx, "load_keywords", return_value=kw_rows):
        assert dispatch_tool("list_keywords_by_position", {"min_position": "x"}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("list_keywords_by_impressions", {"min_impressions": "x"}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("list_keywords_by_position", {"min_position": 1, "max_position": 10}, context=ctx, conn=conn)["total"] == 1

    with patch("website_profiling.tools.audit_tools.llm_tools.list_properties_public", return_value=["bad", {"id": None}]):
        assert dispatch_tool("get_portfolio_summary", {}, conn=conn)["count"] == 0

    conn.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value={
        "health_score": 50,
        "generated_at": datetime.now(timezone.utc),
        "report_id": 3,
        "issue_counts": "not-json",
    })))
    with patch("website_profiling.tools.audit_tools.llm_tools.list_properties_public", return_value=[{"id": 3, "name": "c"}]):
        portfolio = dispatch_tool("get_portfolio_summary", {}, conn=conn)
        assert portfolio["count"] == 1
        assert portfolio["properties"][0]["issue_counts"] == {}

    attention_payload = {
        "content_urls": {
            "missing_alt": [{"url": "https://ex.com/page"}],
            "missing_lazy": [{"url": "https://ex.com/page"}],
            "missing_dimensions": [{"url": "https://ex.com/page"}],
        },
    }
    with patch.object(Ctx, "load_payload", return_value=attention_payload):
        no_inv = dispatch_tool("list_images_needing_attention", {}, context=ctx, conn=conn)
        assert no_inv["inventory_available"] is False
        assert no_inv["total"] >= 1

    attention_payload["image_inventory"] = [{
        "url": "https://cdn.ex.com/huge.jpg",
        "size_bytes": 400_000,
        "content_type": "image/jpeg",
        "source_pages": ["https://ex.com/page"],
        "error": "timeout",
    }]
    attention_payload["image_inventory_summary"] = {"unoptimized_min_kb": 200}
    with patch.object(Ctx, "load_payload", return_value=attention_payload):
        with_inv = dispatch_tool("list_images_needing_attention", {}, context=ctx, conn=conn)
        assert with_inv["inventory_available"] is True
        assert with_inv["items"][0].get("reasons")

    lh_summary_payload = {
        "lighthouse_summary": "bad",
        "lighthouse_by_url": {"skip": "bad"},
    }
    with patch.object(Ctx, "load_payload", return_value=lh_summary_payload), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_page_summaries",
        return_value={"https://ex.com/a": "bad"},
    ), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_summary",
        return_value=None,
    ):
        assert dispatch_tool("get_lighthouse_summary", {}, context=ctx, conn=conn)["pages_audited"] == 1
