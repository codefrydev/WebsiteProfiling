"""Line-coverage tests for audit tools expansion modules."""
from __future__ import annotations

import json
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
import requests

from website_profiling.tools.audit_tools import dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.audit_tools.crawl import crawl_lists as cl_mod
from website_profiling.tools.audit_tools.crawl import crawl_metrics as cm_mod
from website_profiling.tools.audit_tools.geo import geo_tools as geo_mod
from website_profiling.tools.audit_tools.google import google as google_mod
from website_profiling.tools.audit_tools.integrations import integration_tools as int_mod
from website_profiling.tools.audit_tools.keywords import keywords as kw_mod
from website_profiling.tools.audit_tools.integrations import llm_tools as llm_mod
from website_profiling.tools.audit_tools.core import payload_extras as pe_mod
from website_profiling.tools.audit_tools.compare import compare_slices as cmp_mod
from website_profiling.tools.audit_tools.report import report as report_mod


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


@pytest.fixture
def ctx() -> Ctx:
    return Ctx(property_id=1, report_id=1)


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
            "content_excerpt": "Widgets are devices used for many purposes.",
            "word_count": 400,
            "has_schema": "true",
            "page_analysis": json.dumps({
                "json_ld_types": ["Organization", "FAQPage"],
                "axe_violations": [{"id": "label"}, "skip"],
                "pagination": {"rel_next": True, "rel_prev": True, "amphtml": "https://ex.com/amp"},
                "headings": [{"level": "h1", "text": "Home"}],
            }),
            "fetch_method": "static",
            "canonical_url": "https://ex.com/other",
        },
        {
            "url": "https://ex.com/",
            "status": "200",
            "title": "Home rendered",
            "meta_description": "Home desc",
            "h1": "Home R",
            "outlinks": 2,
            "word_count": 500,
            "fetch_method": "rendered",
            "page_analysis": json.dumps({"json_ld_types": ["Person"]}),
        },
        {
            "url": "https://ex.com/about",
            "status": "200",
            "title": "About",
            "meta_description": "About",
            "h1": "About us",
            "outlinks": 1,
            "page_analysis": json.dumps({"json_ld_types": ["Organization"]}),
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
        {
            "url": "https://ex.com/dup",
            "status": "200",
            "title": "Dup",
            "meta_description": "same",
            "outlinks": 1,
            "page_analysis": "{}",
        },
        {
            "url": "https://ex.com/dup2",
            "status": "200",
            "title": "Dup",
            "meta_description": "same",
            "outlinks": 1,
            "page_analysis": "{}",
        },
        {
            "url": "https://ex.com/bad-ratio",
            "status": "200",
            "title": "Bad",
            "content_html_ratio": "bad",
            "page_analysis": "{}",
        },
        {
            "url": "https://ex.com/cache",
            "status": "200",
            "title": "Cache",
            "cache_control": "no-cache",
            "etag": "",
            "page_analysis": "{}",
        },
    ])


@contextmanager
def _patch_geo_readiness_http(
    *,
    llms_found: bool = True,
    robots_score: int = 9,
    robots_side_effect: Exception | None = None,
):
    """Patch live HTTP helpers so get_geo_readiness_score never hits the network."""
    llms_ret = {
        "found": llms_found,
        "depth": {"depth_score": 12} if llms_found else {},
    }
    robots_patch = (
        {"side_effect": robots_side_effect}
        if robots_side_effect is not None
        else {"return_value": {"robots_score": robots_score}}
    )
    with (
        patch.object(geo_mod, "_fetch_llms_txt", return_value=llms_ret),
        patch.object(geo_mod, "_score_robots_ai_access", **robots_patch),
        patch.object(geo_mod, "_score_meta_signals", return_value={"meta_score": 7}),
        patch.object(geo_mod, "_score_freshness_signals", return_value={"freshness_score": 4}),
        patch.object(
            geo_mod,
            "_fetch_ai_discovery",
            return_value={"discovery_score": 4, "found_count": 2, "endpoints": {}},
        ),
    ):
        yield


def test_payload_extras_edge_paths(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_payload", return_value=None):
        assert pe_mod.get_rich_results_summary(conn, ctx, {})["missing"] is True
        assert pe_mod.list_rich_results_failures(conn, ctx, {})["error"]
        assert pe_mod.get_competitor_keyword_gap(conn, ctx, {})["error"]
        assert pe_mod.get_portfolio_benchmark(conn, ctx, {})["missing"] is True
        assert pe_mod.get_site_anchor_text_summary(conn, ctx, {})["error"]

    with patch.object(Ctx, "load_payload", return_value={"rich_results_meta": "bad"}):
        assert pe_mod.get_rich_results_summary(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_payload", return_value={"rich_results_validation": "bad"}):
        assert pe_mod.list_rich_results_failures(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_payload", return_value={"competitor_keyword_gap": "bad"}):
        assert pe_mod.get_competitor_keyword_gap(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_payload", return_value={"inlink_anchor_matrix": []}):
        assert pe_mod.get_site_anchor_text_summary(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_payload", return_value={"inlink_anchor_matrix": [{"anchor_text": "x", "inlink_count": "bad"}]}):
        out = pe_mod.get_site_anchor_text_summary(conn, ctx, {})
        assert out["anchors"][0]["inlink_count"] == 0

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert pe_mod.get_pagination_audit_summary(conn, ctx, {})["orphan_prev_count"] == 0

    pag_df = pd.DataFrame([
        {"url": "https://ex.com/p1", "status": "200", "canonical_url": "https://ex.com/c", "page_analysis": json.dumps({"pagination": {"rel_prev": True, "amphtml": "https://ex.com/amp"}})},
        {"url": "https://ex.com/p2", "status": "404", "page_analysis": "{}"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=pag_df):
        pag = pe_mod.get_pagination_audit_summary(conn, ctx, {})
        assert pag["orphan_prev_count"] >= 1
        assert pag["amp_mismatch_count"] >= 1

    with patch.object(Ctx, "load_payload", return_value={"portfolio_benchmark": {"x": 1}}):
        assert pe_mod.get_portfolio_benchmark(conn, ctx, {})["missing"] is False


def test_crawl_metrics_and_lists(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert cm_mod.get_asset_weight_summary(conn, ctx, {})["missing"] is True
        assert cm_mod.get_readability_summary(conn, ctx, {})["missing"] is True

    bad_df = pd.DataFrame([
        {"url": "https://ex.com/", "status": "200", "total_js_bytes": "bad", "reading_level": "bad"},
        {"url": "https://ex.com/2", "status": "200", "reading_level": 0},
        {"url": "https://ex.com/3", "status": "200", "reading_level": 14},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=bad_df):
        assert cm_mod.get_asset_weight_summary(conn, ctx, {})["js_bytes"]["count"] == 0
        assert cm_mod.get_readability_summary(conn, ctx, {})["pages_with_reading_level"] == 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame([{"url": "x", "status": "200"}])):
        assert cl_mod.get_axe_audit_summary(conn, ctx, {})["pages_with_violations"] == 0
        assert cl_mod.list_duplicate_title_groups(conn, ctx, {})["total"] == 0
        assert cl_mod.list_heavy_pages_by_bytes(conn, ctx, {})["total"] == 0
        assert cl_mod.get_heading_outline_for_url(conn, ctx, {"url": "https://ex.com"})["error"]

    df = _crawl_df()
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        assets = cm_mod.get_asset_weight_summary(conn, ctx, {})
        assert assets["js_bytes"]["count"] >= 1
        read = cm_mod.get_readability_summary(conn, ctx, {})
        assert read["pages_with_reading_level"] >= 1
        assert cl_mod.list_pages_with_axe_violations(conn, ctx, {})["total"] >= 1
        assert cl_mod.get_axe_audit_summary(conn, ctx, {})["total_violations"] >= 1
        assert cl_mod.list_pages_with_mixed_content(conn, ctx, {})["total"] >= 1
        assert cl_mod.list_duplicate_title_groups(conn, ctx, {})["total"] >= 1
        assert cl_mod.list_heavy_pages_by_bytes(conn, ctx, {})["total"] >= 1
        assert cl_mod.list_pages_poor_cache_headers(conn, ctx, {})["total"] >= 1
        assert cl_mod.list_pages_low_content_ratio(conn, ctx, {"max_content_html_ratio": "bad"})["total"] >= 1
        assert cl_mod.get_heading_outline_for_url(conn, ctx, {})["error"] == "url is required"
        assert cl_mod.get_heading_outline_for_url(conn, ctx, {"url": "https://ex.com/missing"})["error"]

    payload = {
        "orphan_urls": ["https://ex.com/orphan"],
        "top_pages": [{"url": "https://ex.com/", "inlinks": 3}],
    }
    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        dead = cl_mod.list_dead_end_pages(conn, ctx, {})
        assert dead["total"] >= 1
        outline = cl_mod.get_heading_outline_for_url(conn, ctx, {"url": "https://ex.com/"})
        assert outline.get("heading_sequence")


def test_geo_tools_paths(conn: MagicMock, ctx: Ctx) -> None:
    assert geo_mod._fetch_llms_txt("")["found"] is False

    mock_resp = MagicMock(status_code=200, text="llms content", content=b"llms content")
    with patch("website_profiling.tools.audit_tools.geo.geo_tools.requests.get", return_value=mock_resp):
        found = geo_mod._fetch_llms_txt("ex.com")
        assert found["found"] is True

    with patch("website_profiling.tools.audit_tools.geo.geo_tools.requests.get", side_effect=requests.RequestException("fail")):
        assert geo_mod._fetch_llms_txt("ex.com")["found"] is False

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch.object(
        Ctx, "load_crawl_df", return_value=None,
    ):
        assert geo_mod.get_faq_schema_coverage(conn, ctx, {})["total_2xx"] == 0
        assert geo_mod.list_pages_missing_faq_schema(conn, ctx, {})["total"] == 0
        assert geo_mod.get_eeat_signals_summary(conn, ctx, {})["missing"] is True
        assert geo_mod.get_js_rendering_delta(conn, ctx, {})["total"] == 0

    payload = {"ner_site_summary": {"entities": ["Acme", "Widgets"]}}
    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(
        Ctx, "load_crawl_df", return_value=_crawl_df(),
    ), patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), _patch_geo_readiness_http(
        llms_found=True,
    ):
        geo = geo_mod.get_geo_readiness_score(conn, ctx, {})
        assert 0 <= geo["geo_readiness_score"] <= 100
        aeo = geo_mod.get_aeo_content_signals_for_url(conn, ctx, {"url": "https://ex.com/"})
        assert aeo.get("quotability_score") is not None
        assert geo_mod.get_aeo_content_signals_for_url(conn, ctx, {})["error"]
        eeat = geo_mod.get_eeat_signals_summary(conn, ctx, {})
        assert eeat["pages_with_organization_schema"] >= 1
        js = geo_mod.get_js_rendering_delta(conn, ctx, {})
        assert js["total"] >= 1
        missing = geo_mod.list_pages_missing_faq_schema(conn, ctx, {})
        assert missing["total"] >= 1
        links = geo_mod.get_internal_link_suggestions(conn, ctx, {"url": "https://ex.com/"})
        assert links.get("suggestions") is not None
        assert geo_mod.get_internal_link_suggestions(conn, ctx, {})["error"]
        assert geo_mod.get_internal_link_suggestions(conn, ctx, {"url": "https://ex.com/nope"})["error"]

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._fetch_llms_txt", return_value={"found": False},
    ):
        assert geo_mod.get_llms_txt_status(conn, ctx, {})["domain"] == "ex.com"

    sparse = pd.DataFrame([{"url": "https://ex.com/only", "status": "200", "title": "Only", "content_excerpt": "one page only here"}])
    with patch.object(Ctx, "load_crawl_df", return_value=sparse):
        assert geo_mod.get_internal_link_suggestions(conn, ctx, {"url": "https://ex.com/only"})["note"]

    aeo_df = pd.DataFrame([{
        "url": "https://ex.com/aeo",
        "status": "200",
        "content_excerpt": "- bullet one\nWidgets are tools that means something.",
        "html": "<li>item</li>",
        "word_count": 250,
        "top_keywords": "widgets",
        "page_analysis": json.dumps({"json_ld_types": ["FAQPage"]}),
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=aeo_df):
        aeo = geo_mod.get_aeo_content_signals_for_url(conn, ctx, {"url": "https://ex.com/aeo"})
        assert aeo["has_lists"] is True
        assert geo_mod.get_aeo_content_signals_for_url(conn, ctx, {"url": "https://ex.com/missing"})["error"]

    empty_geo = pd.DataFrame([{"url": "https://ex.com/e", "status": "404", "page_analysis": "{}"}])
    with patch.object(Ctx, "load_payload", return_value={}), patch.object(Ctx, "load_crawl_df", return_value=empty_geo), patch.object(
        Ctx, "resolve_property_domain", return_value="ex.com",
    ), _patch_geo_readiness_http(llms_found=False):
        geo_empty = geo_mod.get_geo_readiness_score(conn, ctx, {})
        assert geo_empty["components"]["schema_coverage"] == 0


def test_geo_readiness_survives_http_task_exception(conn: MagicMock, ctx: Ctx) -> None:
    # A live-HTTP task raising (beyond the RequestException it guards internally)
    # must degrade to a 0 sub-score, not crash the whole composite score.
    with patch.object(Ctx, "load_payload", return_value={}), patch.object(
        Ctx, "load_crawl_df", return_value=_crawl_df(),
    ), patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), _patch_geo_readiness_http(
        llms_found=False,
        robots_side_effect=RuntimeError("boom"),
    ):
        result = geo_mod.get_geo_readiness_score(conn, ctx, {})
    assert 0 <= result["geo_readiness_score"] <= 100
    assert result["categories"]["robots_ai_access"]["score"] == 0


def test_google_ctr_and_keywords(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_google", return_value=None):
        assert google_mod.get_gsc_ctr_opportunity_pages(conn, ctx, {})["error"]

    gsc_data = {
        "gsc": {
            "top_pages": [
                {"page": "https://ex.com/a", "impressions": 500, "position": 5, "ctr": "0.5%"},
                "skip",
                {"page": "https://ex.com/b", "impressions": 50, "position": 10, "ctr": "5%"},
                {"page": "https://ex.com/c", "impressions": 200, "position": "bad"},
                {"page": "https://ex.com/d", "impressions": 500, "position": 0, "ctr": "0.5%"},
            ],
        },
    }
    with patch.object(Ctx, "load_google", return_value=gsc_data):
        out = google_mod.get_gsc_ctr_opportunity_pages(conn, ctx, {"min_impressions": "bad"})
        assert "pages" in out
        assert out["provenance"] == "Search Console"

    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"recommended_action": "Improve CTR now", "keyword": "widgets"}]}):
        ctr_kw = kw_mod.list_keywords_ctr_opportunity(conn, ctx, {})
        assert ctr_kw["total"] >= 1

    with patch.object(Ctx, "load_google", return_value={"gsc": {"top_pages": "bad"}}):
        assert google_mod.get_gsc_ctr_opportunity_pages(conn, ctx, {})["total"] == 0

    high_ctr = {"gsc": {"top_pages": [{"page": "https://ex.com/good", "impressions": 1000, "position": 3, "ctr": "15%"}]}}
    with patch.object(Ctx, "load_google", return_value=high_ctr):
        assert google_mod.get_gsc_ctr_opportunity_pages(conn, ctx, {})["total"] == 0


def test_integration_tools_paths(conn: MagicMock, ctx: Ctx) -> None:
    assert int_mod.get_gsc_url_inspection(conn, Ctx(property_id=None), {"url": "https://ex.com"})["missing"]
    assert int_mod.get_gsc_url_inspection(conn, ctx, {})["missing"]
    with patch("website_profiling.tools.audit_tools.integrations.integration_tools.get_property_by_id", return_value=None):
        assert int_mod.get_gsc_url_inspection(conn, ctx, {"url": "https://ex.com"})["missing"]

    with patch("website_profiling.tools.audit_tools.integrations.integration_tools.get_property_by_id", return_value={"canonical_domain": "ex.com"}):
        assert int_mod.get_bing_index_status(conn, ctx, {})["missing"]
        with patch("website_profiling.db.config_store.read_pipeline_config", return_value=({"bing_webmaster_api_key": "key"}, {})):
            with patch("website_profiling.integrations.bing.webmaster._bing_json_get", return_value={"d": {"indexed": True}}):
                bing = int_mod.get_bing_index_status(conn, ctx, {"url": "https://ex.com/page"})
                assert bing["provenance"] == "Bing Webmaster"
            with patch("website_profiling.integrations.bing.webmaster._bing_json_get", return_value={"error": "fail"}):
                assert int_mod.get_bing_index_status(conn, ctx, {"url": "https://ex.com/page"})["missing"]

    with patch.object(Ctx, "load_payload", return_value=None):
        assert int_mod.get_gsc_index_coverage(conn, ctx, {})["missing"]
    with patch.object(Ctx, "load_payload", return_value={"indexation_coverage": "bad"}):
        assert int_mod.get_gsc_index_coverage(conn, ctx, {})["missing"]

    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"serp_features": ["faq"]}], "serp_overlay_count": 1}):
        serp = int_mod.get_serp_feature_overlay(conn, ctx, {})
        assert serp["total"] == 1

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch.object(
        Ctx, "load_payload",
        return_value={"categories": [{"issues": [{"message": "Acme brand issue"}]}], "ner_site_summary": {"entities": ["Acme"]}, "schema_coverage": {"pages_with_schema": 3}},
    ):
        cite = int_mod.check_ai_citation_presence(conn, ctx, {"query": "Acme"})
        assert cite["entity_in_ner_summary"] is True

    prop = {"google_refresh_token": "t", "gsc_site_url": "https://ex.com/"}
    with patch("website_profiling.tools.audit_tools.integrations.integration_tools.get_property_by_id", return_value=prop), patch(
        "website_profiling.tools.audit_tools.integrations.integration_tools.build_credentials", side_effect=RuntimeError("creds"),
    ):
        out = int_mod.get_gsc_url_inspection(conn, ctx, {"url": "https://ex.com"})
        assert "credentials error" in out["error"]

    with patch.object(Ctx, "load_keywords", return_value=None):
        assert int_mod.get_serp_feature_overlay(conn, ctx, {})["missing"] is True
    with patch.object(Ctx, "resolve_property_domain", return_value=""):
        assert int_mod.check_ai_citation_presence(conn, Ctx(property_id=1), {})["missing"] is True


def test_llm_tools_paths(conn: MagicMock, ctx: Ctx) -> None:
    with patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}), patch(
        "website_profiling.llm_config.llm_is_enabled", return_value=False,
    ):
        assert llm_mod._llm_disabled_response()["missing"] is True
        assert llm_mod.generate_issue_fix(conn, ctx, {})["missing"] is True

    with patch("website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={}):
        assert llm_mod.generate_issue_fix(conn, ctx, {"message": ""})["error"]

    with patch("website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={}), patch(
        "website_profiling.llm_client_http.generate_issue_fix_suggestion",
        return_value={"fix": "x"},
    ), patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}):
        out = llm_mod.generate_issue_fix(conn, ctx, {"message": "Fix title"})
        assert out["provenance"] == "AI insights"

    cat_data = {"name": "Tech", "score": 80, "issues": [{"priority": "High", "message": "Slow", "url": "https://ex.com"}]}
    assert llm_mod.summarize_category_for_client(conn, ctx, {})["error"] == "category_id is required"

    with patch("website_profiling.tools.audit_tools.issues.issues.get_category_issues", return_value=cat_data), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={"missing": True},
    ):
        summary = llm_mod.summarize_category_for_client(conn, ctx, {"category_id": "tech"})
        assert summary["provenance"] == "Crawl"

    with patch("website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={}), patch(
        "website_profiling.llm_client_http.complete_json",
        return_value={"summary": "Client text"},
    ), patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}), patch(
        "website_profiling.tools.audit_tools.issues.issues.get_category_issues", return_value=cat_data,
    ):
        narrative = llm_mod.summarize_category_for_client(conn, ctx, {"category_id": "tech"})
        assert narrative["narrative"] == "Client text"

    with patch.object(Ctx, "load_payload", return_value=None):
        assert llm_mod.prioritize_fix_roadmap(conn, ctx, {})["error"]
    with patch.object(Ctx, "load_payload", return_value={"categories": []}), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={"error": "off"},
    ), patch.object(Ctx, "load_google", return_value=None), patch.object(Ctx, "load_crawl_df", return_value=None):
        snippet = llm_mod.analyze_serp_snippet_for_url(conn, ctx, {"url": "https://ex.com"})
        assert snippet["provenance"] == "Crawl"

    with patch.object(Ctx, "load_payload", return_value={"site_name": "Ex", "top_pages": [{"url": "https://ex.com"}]}), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={},
    ), patch(
        "website_profiling.llm_client_http.complete_json",
        return_value={"content": "# Ex\n\nPolished"},
    ), patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}):
        draft = llm_mod.draft_llms_txt(conn, ctx, {})
        assert "Polished" in draft["llms_txt_draft"]

    with patch("website_profiling.tools.audit_tools.issues.issues.get_category_issues", return_value={"error": "no cat"}):
        assert llm_mod.summarize_category_for_client(conn, ctx, {"category_id": "x"})["error"] == "no cat"

    with patch.object(Ctx, "load_payload", return_value={"categories": []}), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={},
    ), patch("website_profiling.llm_client_http.complete_json", return_value=None), patch.object(
        Ctx, "load_google", return_value={"gsc": {}},
    ), patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame([{"url": "https://ex.com", "title": "T", "meta_description": "D"}])):
        snippet = llm_mod.analyze_serp_snippet_for_url(conn, ctx, {"url": "https://ex.com"})
        assert snippet["provenance"] == "AI insights"

    with patch.object(Ctx, "load_payload", return_value=None):
        assert llm_mod.draft_llms_txt(conn, ctx, {})["error"]

    client = MagicMock(complete_json=MagicMock(side_effect=RuntimeError("llm fail")))
    with patch.object(Ctx, "load_payload", return_value={"site_name": "Ex"}), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={},
    ), patch("website_profiling.llm_client_http.complete_json", side_effect=RuntimeError("llm fail")), patch(
        "website_profiling.llm_config.load_llm_config_from_db", return_value={},
    ):
        err_snippet = llm_mod.analyze_serp_snippet_for_url(conn, ctx, {"url": "https://ex.com"})
        assert "error" in err_snippet


def test_report_search_impact_sort(conn: MagicMock, ctx: Ctx) -> None:
    payload = {
        "categories": [{
            "id": "x",
            "issues": [
                {"priority": "Low", "message": "a", "impact_score": 1},
                {"priority": "High", "message": "b", "impact_score": 99, "gsc_clicks": 5},
            ],
        }],
    }
    with patch.object(Ctx, "load_payload", return_value=payload):
        out = report_mod.search_issues(conn, ctx, {"sort": "impact", "limit": 10})
        assert out["issues"][0]["impact_score"] == 99
        top = report_mod.list_top_impact_issues(conn, ctx, {"limit": 1})
        assert top["issues"][0]["gsc_clicks"] == 5


def test_expansion_coverage_gaps(conn: MagicMock, ctx: Ctx) -> None:
    empty = pd.DataFrame()
    with patch.object(Ctx, "load_crawl_df", return_value=empty):
        assert cl_mod.get_axe_audit_summary(conn, ctx, {})["pages_with_violations"] == 0
        assert cl_mod.list_duplicate_title_groups(conn, ctx, {})["total"] == 0
        assert cl_mod.list_heavy_pages_by_bytes(conn, ctx, {})["total"] == 0
        assert cl_mod.get_heading_outline_for_url(conn, ctx, {"url": "https://ex.com"})["error"] == "no crawl data"

    orphan_payload = {"orphan_urls": ["https://ex.com/orphaned"], "top_pages": [{"url": "https://ex.com/orphaned", "inlinks": 2}]}
    orphan_df = pd.DataFrame([{"url": "https://ex.com/orphaned", "status": "200", "outlinks": 0, "title": "Orphan"}])
    with patch.object(Ctx, "load_payload", return_value=orphan_payload), patch.object(Ctx, "load_crawl_df", return_value=orphan_df):
        assert cl_mod.list_dead_end_pages(conn, ctx, {})["total"] == 0

    no_assets = pd.DataFrame([{"url": "https://ex.com/light", "status": "200", "total_js_bytes": 0, "total_css_bytes": 0, "script_count": 0}])
    with patch.object(Ctx, "load_crawl_df", return_value=no_assets):
        assert cl_mod.list_heavy_pages_by_bytes(conn, ctx, {})["total"] == 0

    read_df = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "200", "reading_level": 5},
        {"url": "https://ex.com/b", "status": "200", "reading_level": 8},
        {"url": "https://ex.com/c", "status": "200", "reading_level": 11},
        {"url": "https://ex.com/d", "status": "200", "reading_level": 15},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=read_df):
        hist = cm_mod.get_readability_summary(conn, ctx, {})["histogram"]
        assert hist["0-6"] == 1 and hist["7-9"] == 1 and hist["10-12"] == 1 and hist["13+"] == 1

    assets_df = pd.DataFrame([{"url": "https://ex.com/", "status": "404", "total_js_bytes": 1000}])
    with patch.object(Ctx, "load_crawl_df", return_value=assets_df):
        assert cm_mod.get_asset_weight_summary(conn, ctx, {})["js_bytes"]["count"] == 0

    with patch.object(Ctx, "load_payload", return_value={"portfolio_benchmark": None}):
        assert pe_mod.get_portfolio_benchmark(conn, ctx, {})["missing"] is True
    with patch.object(Ctx, "load_payload", return_value={"inlink_anchor_matrix": ["bad", {"anchor_text": "", "inlink_count": 1}]}):
        assert pe_mod.get_site_anchor_text_summary(conn, ctx, {})["anchors"][0]["anchor_text"] == "(empty)"

    pag_df = pd.DataFrame([{"url": "https://ex.com/p", "status": "200", "page_analysis": json.dumps({"pagination": {"rel_next": True}})}])
    with patch.object(Ctx, "load_crawl_df", return_value=pag_df):
        assert pe_mod.get_pagination_audit_summary(conn, ctx, {})["pages_with_rel_next"] == 1

    low_ctr = {"gsc": {"top_pages": [{"page": "https://ex.com/low", "impressions": 500, "position": 5, "ctr": 0.001}]}}
    with patch.object(Ctx, "load_google", return_value=low_ctr):
        assert google_mod.get_gsc_ctr_opportunity_pages(conn, ctx, {})["total"] == 1

    with patch("website_profiling.tools.audit_tools.integrations.integration_tools.get_property_by_id", return_value={"google_refresh_token": "t"}), patch(
        "website_profiling.tools.audit_tools.integrations.integration_tools.build_credentials", return_value=None,
    ):
        assert int_mod.get_gsc_url_inspection(conn, ctx, {"url": "https://ex.com"})["missing"]
    with patch("website_profiling.tools.audit_tools.integrations.integration_tools.get_property_by_id", return_value={"google_refresh_token": "t", "canonical_domain": ""}), patch(
        "website_profiling.tools.audit_tools.integrations.integration_tools.build_credentials", return_value=object(),
    ):
        assert "GSC site URL" in int_mod.get_gsc_url_inspection(conn, ctx, {"url": "https://ex.com"})["error"]
    assert int_mod.get_bing_index_status(conn, Ctx(property_id=None), {"url": "https://ex.com"})["missing"]
    with patch("website_profiling.tools.audit_tools.integrations.integration_tools.get_property_by_id", return_value=None):
        assert int_mod.get_bing_index_status(conn, ctx, {"url": "https://ex.com"})["missing"]

    with patch.object(Ctx, "load_keywords", return_value={"rows": []}):
        assert int_mod.get_serp_feature_overlay(conn, ctx, {})["total"] == 0

    with patch.object(Ctx, "load_payload", return_value={"categories": ["skip", {"issues": ["skip"]}]}), patch.object(
        Ctx, "resolve_property_domain", return_value="ex.com",
    ):
        cite = int_mod.check_ai_citation_presence(conn, ctx, {})
        assert cite["query"] == "ex.com"

    skip_df = pd.DataFrame([{"url": "https://ex.com/s", "status": "404", "page_analysis": "{}"}])
    with patch.object(Ctx, "load_crawl_df", return_value=skip_df):
        assert geo_mod.list_pages_missing_faq_schema(conn, ctx, {})["total"] == 0
        assert geo_mod.get_eeat_signals_summary(conn, ctx, {})["about_contact_pages"] == 0

    js_df = pd.DataFrame([
        {"url": "https://ex.com/js", "status": "200", "fetch_method": "static", "title": "A", "word_count": 10, "h1": "A"},
        {"url": "https://ex.com/js", "status": "200", "fetch_method": "rendered", "title": "B", "word_count": 100, "h1": "B"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=js_df):
        deltas = geo_mod.get_js_rendering_delta(conn, ctx, {})
        assert deltas["total"] == 1

    link_df = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "200", "title": "Alpha widgets", "content_excerpt": "widgets alpha beta", "h1": "Alpha"},
        {"url": "https://ex.com/b", "status": "200", "title": "Beta widgets", "content_excerpt": "widgets beta gamma", "h1": "Beta"},
        {"url": "https://ex.com/c", "status": "200", "title": "Gamma", "content_excerpt": "gamma delta", "h1": "Gamma"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=link_df):
        links = geo_mod.get_internal_link_suggestions(conn, ctx, {"url": "https://ex.com/a"})
        assert links["suggestions"]

    with patch.object(Ctx, "load_payload", return_value={"categories": []}), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={},
    ):
        assert llm_mod.prioritize_fix_roadmap(conn, ctx, {"limit": "bad"})["roadmap"] == []

    with patch("website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={}), patch(
        "website_profiling.llm_client_http.complete_json", return_value={},
    ), patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}), patch(
        "website_profiling.tools.audit_tools.issues.issues.get_category_issues", return_value={"name": "T", "score": 1, "issues": []},
    ), patch("website_profiling.llm_client_http.parse_json_response", return_value={"summary": "parsed"}):
        summary = llm_mod.summarize_category_for_client(conn, ctx, {"category_id": "t"})
        assert summary.get("narrative") == "parsed"

    with patch.object(Ctx, "load_payload", return_value={"site_name": "Ex"}), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={},
    ), patch("website_profiling.llm_client_http.complete_json", side_effect=RuntimeError("x")):
        draft = llm_mod.draft_llms_txt(conn, ctx, {})
        assert "Ex" in draft["llms_txt_draft"]

    assert llm_mod.analyze_serp_snippet_for_url(conn, ctx, {})["error"] == "url is required"

    read_skip = pd.DataFrame([{"url": "https://ex.com/x", "status": "404", "reading_level": 9}])
    with patch.object(Ctx, "load_crawl_df", return_value=read_skip):
        assert cm_mod.get_readability_summary(conn, ctx, {})["pages_with_reading_level"] == 0

    with patch.object(Ctx, "load_crawl_df", return_value=None):
        assert geo_mod.get_aeo_content_signals_for_url(conn, ctx, {"url": "https://ex.com"})["error"] == "no crawl data"

    bad_wc = pd.DataFrame([{
        "url": "https://ex.com/badwc",
        "status": "200",
        "content_excerpt": "plain text",
        "word_count": "many",
        "page_analysis": "{}",
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=bad_wc):
        assert geo_mod.get_aeo_content_signals_for_url(conn, ctx, {"url": "https://ex.com/badwc"})["word_count"] == 0

    js_blank = pd.DataFrame([{"url": "", "status": "200", "fetch_method": "static", "title": "x", "word_count": 1, "h1": "x"}])
    with patch.object(Ctx, "load_crawl_df", return_value=js_blank):
        assert geo_mod.get_js_rendering_delta(conn, ctx, {})["total"] == 0

    sparse_links = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "404", "title": "", "content_excerpt": "", "h1": ""},
        {"url": "https://ex.com/b", "status": "200", "title": "B", "content_excerpt": "only one valid page", "h1": "B"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=sparse_links):
        assert geo_mod.get_internal_link_suggestions(conn, ctx, {"url": "https://ex.com/b"})["note"]

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert geo_mod.get_internal_link_suggestions(conn, ctx, {"url": "https://ex.com/x"})["error"] == "no crawl data"

    no_token_rows = pd.DataFrame([
        {"url": "https://ex.com/short", "status": "200", "title": "ab", "h1": "cd", "content_excerpt": "ef"},
        {"url": "https://ex.com/good", "status": "200", "title": "widgets page", "h1": "widgets", "content_excerpt": "widgets content here"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=no_token_rows):
        assert geo_mod.get_internal_link_suggestions(conn, ctx, {"url": "https://ex.com/good"})["note"]

    assert int_mod.get_serp_feature_overlay(conn, Ctx(property_id=None), {})["missing"] is True

    with patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}), patch(
        "website_profiling.llm_config.llm_is_enabled", return_value=True,
    ):
        assert llm_mod._llm_disabled_response() == {}

    with patch("website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={}), patch(
        "website_profiling.llm_client_http.complete_json", side_effect=RuntimeError("boom"),
    ), patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}), patch(
        "website_profiling.tools.audit_tools.issues.issues.get_category_issues", return_value={"name": "T", "score": 1, "issues": []},
    ):
        err_summary = llm_mod.summarize_category_for_client(conn, ctx, {"category_id": "t"})
        assert "narrative_error" in err_summary

    with patch.object(Ctx, "load_google", return_value={"gsc": {}}), patch.object(
        Ctx, "load_crawl_df", return_value=pd.DataFrame([{"url": "https://ex.com", "title": "Old", "meta_description": "Old meta"}]),
    ), patch("website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response", return_value={}), patch(
        "website_profiling.llm_client_http.complete_json", return_value={"title": "New", "meta_description": "Meta"},
    ), patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}):
        serp = llm_mod.analyze_serp_snippet_for_url(conn, ctx, {"url": "https://ex.com"})
        assert serp["provenance"] == "AI insights"


def test_compare_slices_error_paths(conn: MagicMock, ctx: Ctx) -> None:
    err = {"error": "bad baseline"}
    with patch("website_profiling.tools.audit_tools.compare.compare_slices.load_compare_pair", return_value=(None, None, None, None, err)):
        assert cmp_mod.compare_indexation_deltas(conn, ctx, {}) == err
        assert cmp_mod.compare_orphan_deltas(conn, ctx, {}) == err
