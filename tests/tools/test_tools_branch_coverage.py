"""Branch and edge-path tests for website_profiling.tools (tools coverage gate)."""
from __future__ import annotations

import json
import zipfile
import io
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from website_profiling.tools import export_artifacts
from website_profiling.tools.audit_tools import _slice, dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.export_crawl_workbook import build_crawl_workbook_zip


@pytest.fixture
def ctx() -> Ctx:
    return Ctx(property_id=1, report_id=1)


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


def test_slice_and_context_remaining_branches() -> None:
    assert _slice.payload_dict_slice({"x": {"a": 1, "b": 2}}, "x", fields=["a"])["data"] == {"a": 1}
    row = {"page_analysis": {"json_ld_types": 42}}
    assert _slice._row_schema_types_list(row) == []
    assert _slice._parse_page_analysis({"page_analysis": {"k": 1}})["k"] == 1

    conn = MagicMock()
    c = Ctx(property_id=None, report_id=1)
    with patch.object(Ctx, "load_payload", return_value={"canonical_domain": "Example.COM"}):
        assert c.resolve_property_domain(conn) == "example.com"


def test_crawl_remaining_branches(conn: MagicMock, ctx: Ctx) -> None:
    from website_profiling.tools.audit_tools import crawl as crawl_mod

    with patch.object(Ctx, "load_payload", return_value={"crawl_run_id": "bad"}), patch(
        "website_profiling.db.crawl_store.read_edges",
        return_value=[("https://ex.com", "https://ex.com/a")],
    ):
        out = crawl_mod.get_internal_links(conn, ctx, {"url": "https://ex.com"})
        assert out["outlink_count"] == 1

    df = pd.DataFrame([
        {
            "url": "https://ex.com/a",
            "status": "200",
            "title": "",
            "noindex": "true",
            "fetch_method": "rendered",
            "word_count": "bad",
            "page_analysis": json.dumps({"pagination": {"rel_next": "https://ex.com/b"}}),
        },
        {
            "url": "https://ex.com/b",
            "status": "404",
            "title": "Has title",
            "word_count": 5,
            "page_analysis": json.dumps({"console_errors": "single-error"}),
        },
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        assert crawl_mod.list_status_4xx_pages(conn, ctx, {})["total"] == 1
        assert crawl_mod.get_page_analysis(conn, ctx, {"url": "https://ex.com/missing"})["error"]
        adv = crawl_mod.search_pages_advanced(
            conn,
            ctx,
            {
                "noindex_only": "true",
                "missing_title": "true",
                "has_pagination": "true",
                "fetch_method": "rendered",
            },
        )
        assert adv["total"] == 1
        assert crawl_mod.search_pages_advanced(
            conn, ctx, {"min_word_count": "x", "word_count": 10}
        )["total"] >= 0
        assert crawl_mod.search_pages_advanced(
            conn, ctx, {"max_word_count": "y", "word_count": 10}
        )["total"] >= 0
        assert crawl_mod.search_pages_advanced(conn, ctx, {"status": "200", "url_contains": "ex"})["total"] == 1
        assert crawl_mod.list_pages_with_console_errors(conn, ctx, {})["total"] == 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert crawl_mod._status_prefix_pages(conn, ctx, {}, "4")["total"] == 0
        assert crawl_mod.get_page_analysis(conn, ctx, {"url": "https://ex.com"})["error"]
        assert crawl_mod.search_pages_advanced(conn, ctx, {})["total"] == 0
        assert crawl_mod.list_pages_with_console_errors(conn, ctx, {})["total"] == 0

    payload = {
        "links": "bad",
        "graph_edges": "bad",
        "graph_nodes": ["a"],
    }
    with patch.object(Ctx, "load_payload", return_value=payload):
        links = crawl_mod.get_crawl_links_table(conn, ctx, {"url_contains": "ex"})
        assert links["links"] == []
        edges = crawl_mod.get_graph_edges_sample(conn, ctx, {})
        assert edges["graph_node_count"] == 1


def test_crawl_lists_remaining_branches(conn: MagicMock, ctx: Ctx) -> None:
    from website_profiling.tools.audit_tools import crawl_lists as cl_mod

    assert cl_mod._is_2xx("") is False
    df_no_status = pd.DataFrame([{"url": "https://ex.com"}])
    assert len(cl_mod._success_df(df_no_status)) == 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert cl_mod._filter_crawl_pages(conn, ctx, {}, predicate=lambda r: True, projection=lambda r: r)["total"] == 0

    with patch.object(Ctx, "load_payload", return_value={"content_urls": {"missing_alt": "bad"}}):
        out = cl_mod._content_urls_list(conn, ctx, {}, "missing_alt")
        assert out["total"] == 0

    df = pd.DataFrame([
        {
            "url": "https://ex.com/a",
            "status": "200",
            "images_without_alt": "bad",
            "heading_sequence": "",
            "redirect_chain_length": "bad",
        },
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        assert cl_mod.list_pages_with_missing_alt(conn, ctx, {})["total"] == 0
        assert cl_mod.list_pages_skipped_headings(conn, ctx, {})["total"] == 0
        assert cl_mod.list_long_redirect_chains(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame([{"url": "https://ex.com", "status": "200"}])):
        assert cl_mod.list_pages_missing_viewport(conn, ctx, {})["note"]

    payload = {"social_coverage": {"og_image_missing": ["https://ex.com/no-og"]}}
    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(
        Ctx, "load_crawl_df", return_value=pd.DataFrame([{"url": "https://ex.com", "status": "200", "og_image": ""}]),
    ):
        assert cl_mod.list_pages_missing_og_image(conn, ctx, {})["total"] == 1

    with patch.object(Ctx, "load_payload", return_value={}):
        assert cl_mod.get_top_pages_by_pagerank(conn, ctx, {})["error"]

    bad_pr = {"top_pages": ["bad", {"url": "https://ex.com", "pagerank": "n/a"}]}
    with patch.object(Ctx, "load_payload", return_value=bad_pr):
        assert cl_mod.get_top_pages_by_pagerank(conn, ctx, {})["total"] == 0


def test_backlinks_charts_compare_and_content(conn: MagicMock, ctx: Ctx) -> None:
    from website_profiling.tools.audit_tools import backlinks as bl_mod
    from website_profiling.tools.audit_tools import charts as charts_mod
    from website_profiling.tools.audit_tools import compare_slices as cmp_mod
    from website_profiling.tools.audit_tools import content as content_mod

    assert bl_mod.get_gsc_links_import_status(conn, Ctx(property_id=None), {})["error"]
    assert bl_mod.get_gsc_sample_links(conn, Ctx(property_id=None), {})["error"]
    assert bl_mod.get_gsc_latest_links(conn, Ctx(property_id=None), {})["error"]
    assert bl_mod.get_third_party_links_overlay(conn, Ctx(property_id=None), {})["error"]
    assert bl_mod.get_backlinks_velocity(conn, Ctx(property_id=None), {})["error"]

    with patch.object(Ctx, "load_payload", return_value={}):
        assert charts_mod.get_outlink_distribution(conn, ctx, {})["error"]

    with patch("website_profiling.tools.audit_tools.report.get_report_summary", return_value={"error": "x"}):
        assert charts_mod.get_issue_priority_breakdown(conn, ctx, {})["error"]
    with patch(
        "website_profiling.tools.audit_tools.report.get_report_summary",
        return_value={"issue_counts": "bad", "total_issues": 0},
    ):
        assert charts_mod.get_issue_priority_breakdown(conn, ctx, {})["items"] == []

    err = {"error": "baseline missing"}
    with patch("website_profiling.tools.audit_tools.compare_slices.load_compare_pair", return_value=(None, None, None, None, err)):
        for fn in (
            cmp_mod.compare_security_deltas,
            cmp_mod.compare_content_metrics,
            cmp_mod.compare_google_metrics,
            cmp_mod.compare_priority_counts,
            cmp_mod.compare_health_score_delta,
        ):
            assert fn(conn, ctx, {"baseline_report_id": 1})["error"] == err["error"]

    clusters = ["bad", {"representative_url": "https://ex.com/a", "member_urls": []}]
    with patch.object(Ctx, "load_payload", return_value={"content_duplicates": clusters}):
        assert content_mod.get_duplicate_cluster(conn, ctx, {"cluster_index": 0})["error"]


def test_report_report_extras_keywords_ops(conn: MagicMock, ctx: Ctx) -> None:
    from website_profiling.tools.audit_tools import report as report_mod
    from website_profiling.tools.audit_tools import report_extras as rex_mod
    from website_profiling.tools.audit_tools import keywords as kw_mod
    from website_profiling.tools.audit_tools import ops as ops_mod

    assert report_mod._normalize_priority("weird") == "weird"
    with patch.object(Ctx, "load_payload", return_value={}):
        assert report_mod.list_issues(conn, ctx, {"limit": "bad"})["error"]
        assert report_mod.search_issues(conn, ctx, {"limit": "bad"})["error"]
    with patch.object(Ctx, "load_payload", return_value={"executive_summary": None}):
        assert report_mod.get_executive_summary(conn, ctx, {})["missing"]
        assert report_mod.get_report_meta(conn, ctx, {})["missing"]
        assert report_mod.get_site_level(conn, ctx, {})["missing"]

    payload = {
        "categories": [
            {
                "id": "x",
                "issues": [{"priority": "High", "message": "m", "url": "https://ex.com", "llm_recommendation": "fix"}],
                "recommendations": "bad",
            },
            "bad-cat",
        ],
        "recommendations": "bad",
        "ml_errors": "bad",
    }
    with patch.object(Ctx, "load_payload", return_value=payload):
        issues = report_mod.list_issues(conn, ctx, {"sort": "impact", "priority": "high", "url_contains": "ex"})
        assert issues["total"] == 1
        searched = report_mod.search_issues(conn, ctx, {"message_contains": "m"})
        assert searched["total"] == 1
        assert rex_mod.get_audit_recommendations(conn, ctx, {})["count"] == 0
        assert rex_mod.get_ml_errors(conn, ctx, {})["count"] == 0
        assert rex_mod.list_audit_categories(conn, ctx, {})["count"] == 1
        assert rex_mod.list_issues_with_ai_fixes(conn, ctx, {})["total"] == 1

    assert rex_mod.get_category_recommendations(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_payload", return_value={"categories": [{"id": "y", "recommendations": ["r"]}]}):
        assert rex_mod.get_category_recommendations(conn, ctx, {"category_id": "y"})["recommendations"] == ["r"]

    assert kw_mod.get_keyword_history(conn, Ctx(property_id=None), {"keyword": "x"})["error"]
    assert kw_mod.get_keyword_history(conn, ctx, {})["error"]
    assert kw_mod.get_keyword_serp_overlay(conn, Ctx(property_id=None), {})["error"]
    assert kw_mod.list_keywords_by_action(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "a", "gsc_position": 5}]}):
        ranged = kw_mod.list_keywords_by_position(conn, ctx, {"min_position": 1, "max_position": 10})
        assert ranged["total"] == 1
        assert kw_mod.list_keywords_by_position(conn, ctx, {"min_position": 10, "max_position": 1})["total"] == 0
        assert kw_mod.list_keywords_by_impressions(conn, ctx, {"min_impressions": 5})["total"] == 0

    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "a", "serp_estimated_competition": 0.5}]}):
        assert kw_mod.get_keyword_serp_overlay(conn, ctx, {})["total"] == 1

    log_row = {
        "upload_id": 1,
        "filename": "access.log",
        "analysis": {},
        "line_count": 1,
    }
    with patch("website_profiling.tools.audit_tools.ops._load_log_analysis", return_value=log_row):
        assert ops_mod.get_log_top_paths(conn, ctx, {})["total"] == 0
        assert ops_mod.list_log_only_paths(conn, ctx, {})["total"] == 0
        assert ops_mod.list_crawl_only_paths(conn, ctx, {})["total"] == 0
        assert ops_mod.get_log_googlebot_stats(conn, ctx, {})["parsed_lines"] == 0


def test_lighthouse_links_google_health_security(conn: MagicMock, ctx: Ctx) -> None:
    from website_profiling.tools.audit_tools import lighthouse as lh_mod
    from website_profiling.tools.audit_tools import links as links_mod
    from website_profiling.tools.audit_tools import google as google_mod
    from website_profiling.tools.audit_tools import health as health_mod
    from website_profiling.tools.audit_tools import security as sec_mod
    from website_profiling.tools.audit_tools import indexation_tools as idx_mod

    with patch.object(Ctx, "load_payload", return_value={"lighthouse_by_url": "bad"}), patch(
        "website_profiling.tools.audit_tools.lighthouse.read_lighthouse_page_summaries",
        return_value={"https://ex.com": {"performance": 10}},
    ):
        assert lh_mod.get_lighthouse_for_url(conn, ctx, {"url": "https://ex.com"})["lighthouse"]

    lh_payload = {
        "lighthouse_by_url": {
            "https://ex.com/slow": {"scores": {"performance": 20}},
            "https://ex.com/seo": {"scores": {"seo": 40}},
            "https://ex.com/a11y": {
                "scores": {"accessibility": "bad"},
                "category_scores": {"accessibility_score": 30},
            },
            "https://ex.com/bp": {
                "median_metrics": {"best_practices": 30},
            },
            "https://ex.com/cwv": {
                "median_metrics": {"lcp_ms": "bad", "cls": "bad", "tbt_ms": "bad"},
            },
        },
    }
    with patch.object(Ctx, "load_payload", return_value=lh_payload):
        assert lh_mod.list_slow_pages(conn, ctx, {})["total"] >= 1
        assert lh_mod.list_lighthouse_poor_seo_pages(conn, ctx, {})["total"] >= 1
        assert lh_mod.list_lighthouse_poor_accessibility_pages(conn, ctx, {})["total"] >= 1
        assert lh_mod.list_lighthouse_poor_best_practices_pages(conn, ctx, {})["total"] >= 1
        assert lh_mod.list_lighthouse_cwv_failures(conn, ctx, {})["total"] == 0
        assert lh_mod.get_crux_summary(conn, ctx, {})["missing"]

    with patch.object(Ctx, "load_payload", return_value={"issues": {"broken": []}}):
        assert links_mod.list_broken_link_sources(conn, ctx, {})["total"] == 0
        assert links_mod.get_link_rel_summary(conn, ctx, {})["total_edges"] == 0
        assert links_mod.get_inlink_anchors(conn, ctx, {"url": "https://ex.com"})["total"] == 0
        assert links_mod.list_nofollow_internal_links(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_google", return_value={"ga4": {"top_pages": [{"path": "/home", "sessions": 3}]}}):
        assert google_mod.get_ga4_page_metrics(conn, ctx, {"path": "/home"})["metrics"]["sessions"] == 3

    with patch.object(Ctx, "load_payload", return_value={"indexation_coverage": {}}):
        assert idx_mod.list_indexation_gaps(conn, ctx, {"gap_type": "not-real"})["error"]

    conn.execute = MagicMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))
    with patch.object(Ctx, "load_payload", return_value={"categories": []}):
        assert health_mod.get_health_history(conn, ctx, {})["count"] == 0

    with patch.object(Ctx, "load_payload", return_value={"security_findings": [{"severity": "High", "finding_type": "x"}]}):
        assert sec_mod.list_security_findings_by_type(conn, ctx, {"finding_type": "x"})["total"] == 1


def test_image_tools_and_misc_audit_modules(conn: MagicMock, ctx: Ctx) -> None:
    from website_profiling.tools.audit_tools import image_tools as img_mod
    from website_profiling.tools.audit_tools import onpage as onpage_mod
    from website_profiling.tools.audit_tools import llm_tools as llm_mod
    from website_profiling.tools.audit_tools import workflow as wf_mod

    payload = {
        "lighthouse_diagnostics": ["bad", {"lighthouse_audit_id": "uses-optimized-images", "title": "Images"}] * 10,
        "links": [
            "bad",
            {
                "url": "https://ex.com",
                "og_image": "https://cdn.ex.com/og.png",
                "twitter_image": "https://cdn.ex.com/tw.png",
                "page_analysis": {"image_urls": ["https://cdn.ex.com/hero.jpg", "https://cdn.ex.com/hero.jpg"]},
            },
        ],
        "image_inventory": [
            {"url": "https://cdn.ex.com/big.png", "size_bytes": 500_000, "content_type": "image/png"},
            {"url": "https://cdn.ex.com/modern.webp", "size_bytes": 500_000, "content_type": "image/webp"},
            {"url": "https://cdn.ex.com/unknown", "size_bytes": 500_000, "content_type": ""},
        ],
        "image_inventory_summary": {"unoptimized_min_kb": 200},
        "content_urls": {
            "missing_alt": [{"url": "https://ex.com/a"}],
            "missing_lazy": [{"url": "https://ex.com/l"}],
            "missing_dimensions": [{"url": "https://ex.com/d"}],
        },
        "social_coverage": {"og_image_missing": ["https://ex.com/no-og"]},
    }
    df = pd.DataFrame([
        {
            "url": "https://ex.com/a",
            "status": "200",
            "images_without_alt": 1,
            "img_without_lazy": 1,
            "img_without_dimensions": 1,
            "images_total": 3,
        },
    ])
    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert img_mod.list_site_image_urls(conn, ctx, {"kind": "twitter"})["total"] == 1
        assert img_mod.list_largest_images(conn, ctx, {"min_size_kb": "bad"})["inventory_available"] is True
        assert img_mod.list_unoptimized_images(conn, ctx, {})["total"] >= 1
        assert img_mod.list_pages_without_lazy_images(conn, ctx, {})["total"] >= 1
        assert img_mod.list_pages_with_images_missing_dimensions(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_payload", return_value={"issues": {"seo": [{"message": "m"}]}}):
        assert onpage_mod.list_seo_onpage_issues(conn, ctx, {})["total"] == 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame([{"url": "https://ex.com", "status": "200", "noindex": "true"}])):
        assert onpage_mod.list_pages_noindex(conn, ctx, {})["total"] == 1

    with patch("website_profiling.tools.audit_tools.llm_tools.run_page_coach", return_value={"coach": "ok"}):
        assert llm_mod.get_page_coach(conn, ctx, {"url": "https://ex.com"})["coach"] == "ok"

    assert wf_mod.list_issue_workflow(conn, Ctx(property_id=None), {})["error"]


def test_export_artifacts_workbook_and_custom(tmp_path, monkeypatch, conn: MagicMock, ctx: Ctx) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    artifact = export_artifacts.save_artifact(b"data", filename="x.bin", mime_type="application/octet-stream")
    aid = artifact["artifact_id"]
    meta_path = tmp_path / "exports" / f"{aid}.meta.json"
    data_path = tmp_path / "exports" / f"{aid}.bin"
    assert data_path.exists()
    data_path.unlink()
    assert export_artifacts.read_artifact_bytes(aid) is None
    export_artifacts.delete_artifact(aid)
    assert not meta_path.exists()

    from website_profiling.tools import export_crawl_workbook as wb_mod

    assert wb_mod._parse_custom_fields({"price": 9.99}) == {"price": "9.99"}
    assert wb_mod._parse_custom_fields("{bad") == {}
    assert wb_mod._parse_custom_fields("[]") == {}

    raw = build_crawl_workbook_zip({
        "links": [{"url": "https://ex.com/p", "custom_fields": '{"price":"9.99"}'}],
        "categories": ["bad", {"name": "SEO", "issues": ["bad", {"message": "x", "priority": "Low"}]}],
    })
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        assert "custom_fields.csv" in zf.namelist()


def test_tools_remaining_branch_coverage(conn: MagicMock, ctx: Ctx, tmp_path, monkeypatch) -> None:
    from website_profiling.tools.audit_tools import backlinks as bl_mod
    from website_profiling.tools.audit_tools import charts as charts_mod
    from website_profiling.tools.audit_tools import content as content_mod
    from website_profiling.tools.audit_tools import crawl as crawl_mod
    from website_profiling.tools.audit_tools import crawl_lists as cl_mod
    from website_profiling.tools.audit_tools import export_tools as et_mod
    from website_profiling.tools.audit_tools import google as google_mod
    from website_profiling.tools.audit_tools import health as health_mod
    from website_profiling.tools.audit_tools import image_tools as img_mod
    from website_profiling.tools.audit_tools import issues as issues_mod
    from website_profiling.tools.audit_tools import keywords as kw_mod
    from website_profiling.tools.audit_tools import lighthouse as lh_mod
    from website_profiling.tools.audit_tools import links as links_mod
    from website_profiling.tools.audit_tools import llm_tools as llm_mod
    from website_profiling.tools.audit_tools import onpage as onpage_mod
    from website_profiling.tools.audit_tools import ops as ops_mod
    from website_profiling.tools.audit_tools import report as report_mod
    from website_profiling.tools.audit_tools import report_extras as rex_mod
    from website_profiling.tools.audit_tools import security as sec_mod
    from website_profiling.tools import export_crawl_workbook as wb_mod

    monkeypatch.setenv("DATA_DIR", str(tmp_path))

    assert cl_mod._heading_skipped("h1,h3") is True
    assert cl_mod._heading_skipped("h1,h2") is False
    with patch.object(Ctx, "load_payload", return_value={}), patch.object(
        Ctx,
        "load_crawl_df",
        return_value=pd.DataFrame([{"url": "https://ex.com", "status": "200", "og_image": ""}]),
    ):
        assert cl_mod.list_pages_missing_og_image(conn, ctx, {})["total"] == 1
    with patch.object(Ctx, "load_payload", return_value={"top_pages": "bad"}):
        assert cl_mod.get_top_pages_by_pagerank(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_gsc_links", return_value={"sample_links": [{"url": "https://ex.com"}]}):
        assert bl_mod.get_gsc_sample_links(conn, ctx, {})["total"] == 1
    with patch.object(Ctx, "load_gsc_links", return_value=None):
        assert bl_mod.get_gsc_sample_links(conn, ctx, {})["missing"]

    with patch.object(Ctx, "load_payload", return_value={"outlink_labels": ["a"], "outlink_counts": [1]}):
        assert charts_mod.get_outlink_distribution(conn, ctx, {})["items"]

    with patch.object(Ctx, "load_payload", return_value={}):
        assert content_mod.get_duplicate_cluster(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_payload", return_value={"content_duplicates": "bad"}):
        assert content_mod.get_duplicate_cluster(conn, ctx, {})["missing"]
    clusters = [{"representative_url": "https://ex.com/a", "member_urls": []}, "bad"]
    with patch.object(Ctx, "load_payload", return_value={"content_duplicates": clusters}):
        assert content_mod.get_duplicate_cluster(conn, ctx, {"url": "https://ex.com/a"})["cluster_index"] == 0

    no_pag_df = pd.DataFrame([{
        "url": "https://ex.com/c",
        "status": "200",
        "noindex": "true",
        "title": "",
        "fetch_method": "rendered",
        "page_analysis": json.dumps({"pagination": {}}),
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=no_pag_df):
        assert crawl_mod.search_pages_advanced(conn, ctx, {"has_pagination": "true"})["total"] == 0
    crawl_df = pd.DataFrame([{"url": "https://ex.com/a", "status": "200", "title": "t"}])
    with patch.object(Ctx, "load_crawl_df", return_value=crawl_df):
        assert crawl_mod.search_pages_advanced(conn, ctx, {"url_contains": "nomatch"})["total"] == 0

    assert img_mod._preview_from_bucket(["https://ex.com/s"])["total"] == 1
    assert img_mod._preview_from_bucket([{"bad": 1}])["total"] == 1
    assert img_mod._int_val("bad") == 0
    assert img_mod._threshold_kb({"min_size_kb": "bad"}, {"image_inventory_summary": {"unoptimized_min_kb": "bad"}}) == 200
    with patch.object(Ctx, "load_payload", return_value={}):
        assert img_mod.get_image_audit_summary(conn, ctx, {})["error"]
        assert img_mod.list_site_image_urls(conn, ctx, {})["error"]
        assert img_mod.list_lighthouse_image_opportunities(conn, ctx, {})["error"]
        assert img_mod.list_largest_images(conn, ctx, {})["error"]
        assert img_mod.list_unoptimized_images(conn, ctx, {})["error"]
        assert img_mod.list_images_needing_attention(conn, ctx, {})["error"]
    link_payload = {
        "links": [{
            "url": "https://ex.com",
            "og_image": "",
            "twitter_image": "https://cdn.ex.com/tw.png",
            "page_analysis": {"image_urls": ["", "https://cdn.ex.com/a.jpg", "https://cdn.ex.com/a.jpg"]},
        }],
        "lighthouse_diagnostics": ["bad", {"lighthouse_audit_id": "uses-optimized-images", "title": "T"}] * 10,
        "image_inventory": [
            {"url": "https://cdn.ex.com/err.png", "size_bytes": 500_000, "content_type": "image/png", "error": "timeout"},
            {"url": "https://cdn.ex.com/big.webp", "size_bytes": 500_000, "content_type": "image/webp", "source_pages": ["https://ex.com/a"]},
            {"url": "https://cdn.ex.com/unk", "size_bytes": 500_000, "content_type": ""},
        ],
        "image_inventory_summary": {"unoptimized_min_kb": 200},
        "content_urls": {"missing_alt": [{"url": "https://ex.com/a"}]},
    }
    with patch.object(Ctx, "load_payload", return_value=link_payload):
        assert img_mod.list_site_image_urls(conn, ctx, {"kind": "content"})["total"] == 1
        assert img_mod.list_unoptimized_images(conn, ctx, {})["total"] >= 1
        assert img_mod.list_images_needing_attention(conn, ctx, {})["total"] >= 1
    with patch.object(Ctx, "load_payload", return_value={"content_urls": {}}), patch.object(Ctx, "load_crawl_df", return_value=None):
        assert img_mod.list_pages_without_lazy_images(conn, ctx, {})["total"] == 0

    assert google_mod.get_ga4_summary(conn, ctx, {})["error"]
    assert google_mod.get_gsc_page_query_slice(conn, ctx, {})["error"]
    assert google_mod.get_ga4_page_metrics(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_google", return_value={"ga4": {"top_pages": ["bad", {"path": "/home", "sessions": 2}]}}):
        assert google_mod.get_ga4_page_metrics(conn, ctx, {"path": "https://ex.com/home"})["metrics"]["sessions"] == 2
        assert google_mod.get_ga4_page_metrics(conn, ctx, {"path": "/missing"})["missing"]

    conn.execute = MagicMock(return_value=MagicMock(fetchall=MagicMock(return_value=[])))
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch.object(Ctx, "load_payload", return_value={"canonical_domain": "ex.com"}):
        c = Ctx(property_id=None, report_id=1)
        assert health_mod.list_report_history(conn, c, {})["count"] == 0
    assert health_mod.get_category_health_history(conn, Ctx(property_id=None), {})["error"]
    row = MagicMock()
    row.__getitem__ = lambda self, i: ["{}", datetime.now(timezone.utc), 1, 80][i]
    conn.execute = MagicMock(return_value=MagicMock(fetchall=MagicMock(return_value=[row])))
    with patch.object(Ctx, "load_payload", return_value={}):
        hist = health_mod.get_category_health_history(conn, ctx, {"category_id": "seo", "limit": "bad"})
        assert hist["count"] == 1

    assert kw_mod.get_striking_distance_keywords(conn, Ctx(property_id=None), {})["error"]
    with patch.object(Ctx, "load_keywords", return_value={"striking_distance": [{"keyword": "a"}]}):
        assert kw_mod.get_striking_distance_keywords(conn, ctx, {})["total"] == 1
    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "a", "gsc_impressions": "bad"}]}):
        assert kw_mod.list_keywords_by_impressions(conn, ctx, {"min_impressions": "bad"})["error"]
        assert kw_mod.list_keywords_by_impressions(conn, ctx, {"min_impressions": 0})["total"] == 1
    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "a", "gsc_position": 5}]}):
        assert kw_mod.list_keywords_by_position(conn, ctx, {"min_position": 1, "max_position": 10})["total"] == 1

    lh_bad = {
        "lighthouse_by_url": {
            "bad": "x",
            "https://ex.com/slow": {"performance": 20},
            "https://ex.com/seo": {"scores": {"seo": 40}},
            "https://ex.com/cwv": {"median_metrics": {"lcp_ms": 5000, "cls": 0.5, "tbt_ms": 500}},
            "https://ex.com/a11y": {"scores": {"accessibility": "bad"}, "category_scores": {"accessibility_score": 30}},
        },
        "crux_summary": {"origin": "https://ex.com"},
        "lighthouse_human_summary": "Human text",
    }
    with patch.object(Ctx, "load_payload", return_value=lh_bad):
        assert lh_mod.list_slow_pages(conn, ctx, {})["total"] >= 1
        assert lh_mod.list_lighthouse_poor_seo_pages(conn, ctx, {})["total"] >= 1
        assert lh_mod.list_lighthouse_cwv_failures(conn, ctx, {})["total"] >= 1
        assert lh_mod.get_crux_summary(conn, ctx, {})["data"]
        assert lh_mod.get_lighthouse_human_summary(conn, ctx, {})["has_summary"]
    with patch.object(Ctx, "load_payload", return_value={}):
        assert lh_mod._list_lighthouse_poor_category(conn, ctx, {}, score_keys=("x",), result_key="x", threshold_arg="t", default_threshold=50)["error"]

    with patch.object(Ctx, "load_payload", return_value={}):
        assert links_mod.list_broken_link_sources(conn, ctx, {})["error"]
        assert links_mod.get_link_rel_summary(conn, ctx, {})["error"]
        assert links_mod.get_inlink_anchors(conn, ctx, {})["error"]
        assert links_mod.list_nofollow_internal_links(conn, ctx, {})["error"]
    broken_payload = {
        "issues": {"broken": [{"url": "https://ex.com/broken"}]},
        "graph_edges": [("https://ex.com", "https://ex.com/broken")],
        "link_edges": [{"link_type": "internal", "is_nofollow": True, "from": "a", "to": "b"}],
        "inlink_anchor_matrix": [{"target_url": "https://ex.com/t", "anchor": "x"}],
    }
    with patch.object(Ctx, "load_payload", return_value=broken_payload):
        assert links_mod.list_broken_link_sources(conn, ctx, {})["total"] == 1
        assert links_mod.get_link_rel_summary(conn, ctx, {})["total_edges"] >= 0
        assert links_mod.get_inlink_anchors(conn, ctx, {"url": "https://ex.com/t"})["total"] == 1
        assert links_mod.list_nofollow_internal_links(conn, ctx, {})["total"] == 1

    with patch.object(Ctx, "load_payload", return_value={"categories": [{"id": "c", "name": "C", "issues": []}]}):
        assert report_mod.get_report_summary(conn, ctx, {})["total_issues"] == 0
        assert report_mod.search_issues(conn, ctx, {"limit": "bad", "category_id": "c", "url_contains": "ex", "message_contains": "m"})["total"] == 0
        assert report_mod.get_critical_issues(conn, ctx, {})["total"] == 0
    cat_payload = {
        "categories": [
            {"id": "c", "name": "C", "issues": [{"message": "m", "priority": "Low"}]},
            "bad",
        ],
    }
    with patch.object(Ctx, "load_payload", return_value=cat_payload):
        assert issues_mod.get_category_issues(conn, ctx, {"category_id": "c"})["issue_count"] == 1
        assert rex_mod.get_category_recommendations(conn, ctx, {"category_id": "missing"})["error"]
        assert rex_mod.list_issues_with_ai_fixes(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_payload", return_value={}):
        assert sec_mod.get_security_findings_summary(conn, ctx, {})["error"]
        assert sec_mod.list_security_findings_by_type(conn, ctx, {"finding_type": "x"})["error"]

    with patch.object(Ctx, "load_payload", return_value={"content_urls": "bad"}):
        assert onpage_mod._content_urls_bucket(conn, ctx, {}, "missing_h1")["missing"]
    with patch.object(Ctx, "load_payload", return_value={"content_urls": {"missing_h1": "bad"}}):
        assert onpage_mod._content_urls_bucket(conn, ctx, {}, "missing_h1")["total"] == 0

    assert ops_mod._parse_analysis_field('{"top_paths": []}') == {"top_paths": []}
    assert ops_mod._parse_analysis_field("{bad") == {}
    assert ops_mod.get_log_analysis_by_id(conn, Ctx(property_id=None), {"upload_id": 1})["error"]
    log_row = {
        "upload_id": 2,
        "filename": "access.log",
        "analysis": {"top_paths": "bad", "parsed_lines": 10, "googlebot_hits": 2, "crawl_compare": {"log_only_paths": ["/a"], "crawl_only_paths": ["/b"]}},
        "line_count": 1,
    }
    with patch("website_profiling.tools.audit_tools.ops._load_log_analysis", return_value=log_row):
        assert ops_mod.get_log_top_paths(conn, ctx, {})["total"] == 0
        assert ops_mod.list_log_only_paths(conn, ctx, {})["total"] == 1
        assert ops_mod.list_crawl_only_paths(conn, ctx, {})["total"] == 1
        assert ops_mod.get_log_googlebot_stats(conn, ctx, {})["googlebot_ratio"] == 0.2

    props = [{"id": 1, "name": "Ex", "canonical_domain": "ex.com"}]
    snap = MagicMock()
    snap.__getitem__ = lambda self, i: [80, datetime.now(timezone.utc), 1, "not-json"][i]
    conn.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value=snap)))
    with patch("website_profiling.tools.audit_tools.llm_tools.list_properties_public", return_value=props):
        portfolio = llm_mod.get_portfolio_summary(conn, ctx, {})
        assert portfolio["properties"][0]["issue_counts"] == {}

    assert wb_mod._parse_custom_fields("   ") == {}
    rows, cols = wb_mod._custom_field_rows([{"url": "", "custom_fields": '{"a":"1"}'}, {"custom_extract": "x"}])
    assert rows == [] and cols

    assert export_artifacts.read_artifact_bytes("00000000-0000-0000-0000-000000000000") is None
    aid = export_artifacts.save_artifact(b"x", filename="y.bin", mime_type="application/octet-stream")["artifact_id"]
    with patch("website_profiling.tools.export_artifacts.os.remove", side_effect=OSError("denied")):
        export_artifacts.delete_artifact(aid)

    with patch.object(Ctx, "load_payload", return_value={"site_name": "Ex"}), patch(
        "website_profiling.tools.audit_tools.export_tools._dispatch",
        return_value={"error": "tool failed"},
    ):
        assert et_mod.export_list_as_csv(conn, ctx, {"tool_name": "list_broken_links"})["error"] == "tool failed"
    with patch.object(Ctx, "load_payload", return_value={"site_name": "Ex"}), patch(
        "website_profiling.tools.audit_tools.export_tools._dispatch",
        return_value={"pages": [{"url": "https://ex.com"}]},
    ):
        out = et_mod.export_list_as_csv(conn, ctx, {"tool_name": "list_broken_links"})
        assert out.get("total") == 1
    with patch.object(Ctx, "load_payload", return_value={"issues": {"broken": []}}):
        assert isinstance(et_mod._dispatch("list_broken_links", {}, ctx, conn), dict)

    clusters_only_bad = ["bad", "bad2"]
    with patch.object(Ctx, "load_payload", return_value={"content_duplicates": clusters_only_bad}):
        assert content_mod.get_duplicate_cluster(conn, ctx, {"url": "https://ex.com/a"})["error"]

    assert google_mod.get_ga4_page_metrics(conn, ctx, {"path": "/home"})["error"]
    with patch.object(Ctx, "load_google", return_value={"ga4": {}}):
        assert google_mod.get_ga4_page_metrics(conn, ctx, {"path": "/home"})["missing"]
    with patch.object(Ctx, "load_google", return_value={"ga4": {"top_pages": [{"path": "home", "sessions": 1}]}}):
        assert google_mod.get_ga4_page_metrics(conn, ctx, {"path": "home"})["metrics"]["sessions"] == 1

    bad_hist_row = MagicMock()
    bad_hist_row.__getitem__ = lambda self, i: [42, datetime.now(timezone.utc), 1, 80][i]
    conn.execute = MagicMock(return_value=MagicMock(fetchall=MagicMock(return_value=[bad_hist_row])))
    assert health_mod.get_category_health_history(conn, ctx, {})["count"] == 1

    with patch.object(Ctx, "load_keywords", return_value=None):
        assert kw_mod._keyword_list_tool(conn, ctx, {}, "semantic_keyword_clusters", "clusters")["error"]
    with patch.object(Ctx, "load_keywords", return_value={"rows": []}), patch.object(
        Ctx, "load_payload", return_value={"semantic_keyword_clusters": [{"keyword": "a"}]},
    ):
        assert kw_mod._keyword_list_tool(conn, ctx, {}, "semantic_keyword_clusters", "clusters")["total"] == 1
    assert kw_mod.list_keywords_by_action(conn, Ctx(property_id=None), {"recommended_action": "improve"})["error"]
    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "a", "gsc_position": 15}]}):
        assert kw_mod.list_keywords_by_position(conn, ctx, {"min_position": 1, "max_position": 10})["total"] == 0

    with patch.object(Ctx, "load_payload", return_value={}):
        assert lh_mod.list_slow_pages(conn, ctx, {})["error"]
        assert lh_mod.list_lighthouse_poor_seo_pages(conn, ctx, {})["error"]
        assert lh_mod.list_lighthouse_cwv_failures(conn, ctx, {})["error"]
    assert lh_mod._extract_lh_score({"scores": {"x": "bad"}, "category_scores": {"x": "bad"}, "median_metrics": {"x": "bad"}}, "x", "x_score") is None
    assert lh_mod._extract_lh_score({"accessibility": "bad"}, "accessibility") is None

    with patch.object(Ctx, "load_payload", return_value={"inlink_anchor_matrix": "bad"}):
        assert links_mod.get_inlink_anchors(conn, ctx, {})["total"] == 0

    snap_dict = MagicMock()
    snap_dict.__getitem__ = lambda self, i: [80, datetime.now(timezone.utc), 1, {"High": 1}][i]
    conn.execute = MagicMock(return_value=MagicMock(fetchone=MagicMock(return_value=snap_dict)))
    with patch("website_profiling.tools.audit_tools.llm_tools.list_properties_public", return_value=[{"id": 1}]):
        assert llm_mod.get_portfolio_summary(conn, ctx, {})["properties"][0]["issue_counts"] == {"High": 1}

    with patch.object(Ctx, "load_payload", return_value={"categories": ["bad", {"id": "c", "issues": ["bad", {"message": "m", "llm_recommendation": "fix"}]}]}):
        assert rex_mod.list_issues_with_ai_fixes(conn, ctx, {})["total"] == 1

    with patch.object(Ctx, "load_payload", return_value={}):
        assert report_mod.get_report_summary(conn, ctx, {})["error"]
        assert report_mod.list_issues(conn, ctx, {"limit": "bad"})["total"] == 0
    with patch.object(Ctx, "load_payload", return_value={"categories": [{"id": "c", "issues": [{"priority": "High", "message": "m"}]}]}):
        assert report_mod.search_issues(conn, ctx, {"priority": "high"})["total"] == 1
    with patch.object(Ctx, "load_payload", return_value={"categories": []}):
        assert report_mod.list_issues(conn, ctx, {"limit": "bad"})["total"] == 0

    with patch.object(Ctx, "load_payload", return_value={"categories": ["bad"]}):
        assert issues_mod.get_category_issues(conn, ctx, {"category_id": "c"})["error"]

    assert ops_mod.get_log_top_paths(conn, Ctx(property_id=None), {})["error"]
    assert ops_mod.list_log_only_paths(conn, Ctx(property_id=None), {})["error"]
    assert ops_mod.list_crawl_only_paths(conn, Ctx(property_id=None), {})["error"]
    assert ops_mod.get_log_googlebot_stats(conn, Ctx(property_id=None), {})["error"]
    assert ops_mod._parse_analysis_field({"k": 1}) == {"k": 1}
    assert ops_mod._parse_analysis_field([1, 2]) == {}
    with patch("website_profiling.tools.audit_tools.ops._load_log_analysis", return_value=None):
        assert ops_mod.list_log_only_paths(conn, ctx, {})["missing"]
        assert ops_mod.list_crawl_only_paths(conn, ctx, {})["missing"]
        assert ops_mod.get_log_googlebot_stats(conn, ctx, {})["missing"]

    diag_payload = {"lighthouse_diagnostics": [
        "bad",
        *[{"lighthouse_audit_id": "uses-optimized-images", "title": "T", "url": f"https://ex.com/{i}"} for i in range(10)],
    ]}
    assert len(img_mod._lighthouse_image_previews(diag_payload, limit=3)) == 3
    dup_links = {"links": [
        {"url": "https://ex.com", "og_image": "https://cdn.ex.com/same.png"},
        {"url": "https://ex.com", "og_image": "https://cdn.ex.com/same.png"},
    ]}
    with patch.object(Ctx, "load_payload", return_value=dup_links):
        assert img_mod.list_site_image_urls(conn, ctx, {})["total"] == 1
    empty_inv = {"image_inventory": [], "image_inventory_summary": {"unoptimized_min_kb": 200}}
    with patch.object(Ctx, "load_payload", return_value=empty_inv):
        assert img_mod.list_unoptimized_images(conn, ctx, {})["inventory_available"] is False
    mixed_inv = {"image_inventory": [
        {"url": "https://cdn.ex.com/skip", "size_bytes": None, "content_type": "image/png"},
        {"url": "https://cdn.ex.com/small", "size_bytes": 100, "content_type": "image/png"},
    ], "image_inventory_summary": {"unoptimized_min_kb": 200}}
    with patch.object(Ctx, "load_payload", return_value=mixed_inv):
        assert img_mod.list_unoptimized_images(conn, ctx, {})["total"] == 0

    rows, _ = wb_mod._custom_field_rows(["bad", {"url": "https://ex.com", "custom_fields": '{"a":"1"}'}])
    assert len(rows) == 1
