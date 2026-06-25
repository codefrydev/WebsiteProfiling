"""Additional line coverage for tools gate modules not fully exercised elsewhere."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
import requests

from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.audit_tools.crawl import crawl_actions as ca_mod
from website_profiling.tools.audit_tools.geo import geo_citability as cit_mod
from website_profiling.tools.audit_tools.geo import geo_detectors as det_mod
from website_profiling.tools.audit_tools.geo import geo_list_tools as geo_list_mod
from website_profiling.tools.audit_tools.geo import geo_tools as geo_mod
from website_profiling.tools.audit_tools.integrations import integration_tools as int_mod
from website_profiling.tools.audit_tools.integrations import llm_tools as llm_mod
from website_profiling.tools.audit_tools.core import sql_query as sql_mod
from website_profiling.tools.audit_tools.core.sql_query import ReadOnlyViolation, assert_read_only, get_sql_schema, run_sql_query


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


@pytest.fixture
def ctx() -> Ctx:
    return Ctx(property_id=1, report_id=1)


def _rich_crawl_df() -> pd.DataFrame:
    stuffing = " ".join(["widgets"] * 12 + ["other"] * 40)
    return pd.DataFrame([
        {
            "url": "https://ex.com/",
            "status": "200",
            "title": "Home",
            "h1": "Home",
            "content_excerpt": "As of 2024, revenue grew 45% to $2.5 million at conference 2024. Version v2.3 now.",
            "html": (
                '<html><body>'
                '<div class="popup modal">Buy Now Sign Up Get Started Subscribe</div>'
                '<img alt="Hero shot of product" src="a.png">'
                '<img src="b.png">'
                '<script type="application/ld+json">{"@type":"VideoObject"}</script>'
                '<track kind="captions" src="subs.vtt">'
                '<h2>Section</h2><h3>Sub</h3><p>Python is a language that enables rapid development.</p>'
                '<a href="https://affiliate.com?ref=1&aff_id=2">x</a>' * 6 +
                '</body></html>'
            ),
            "word_count": 600,
            "heading_sequence": "h1,h2,h3",
            "schema_json": json.dumps([{"@type": "Article"}]),
        },
        {
            "url": "https://ex.com/guide",
            "status": "200",
            "title": "How to build widgets step-by-step",
            "h1": "How to build widgets",
            "content_excerpt": stuffing,
            "html": '<div style="display:none">Hidden injection payload here for testing pattern</div>',
            "word_count": 220,
            "heading_sequence": "h1,h2",
            "schema_json": json.dumps([{"@type": "FAQPage"}]),
        },
        {
            "url": "https://ex.com/thin",
            "status": "200",
            "title": "Thin",
            "content_excerpt": "Home About Contact Privacy Policy Terms of Service Cookie Policy",
            "html": "",
            "word_count": "bad",
            "heading_sequence": "",
            "schema_json": None,
        },
        {
            "url": "https://ex.com/404",
            "status": "404",
            "title": "Missing",
            "content_excerpt": "",
            "html": "",
            "word_count": 0,
            "heading_sequence": "",
            "schema_json": None,
        },
    ])


# ---------------------------------------------------------------------------
# crawl_actions
# ---------------------------------------------------------------------------

def test_crawl_action_helpers_and_validation_paths(conn: MagicMock) -> None:
    assert ca_mod._truthy_cfg({"flag": "yes"}, "flag") is True
    assert ca_mod._normalize_url("") == ""
    assert ca_mod._normalize_url("example.com/path") == "https://example.com/path"
    assert ca_mod._is_valid_url("") is False
    with patch("website_profiling.tools.audit_tools.crawl.crawl_actions.urlparse", side_effect=ValueError("bad")):
        assert ca_mod._is_valid_url("https://example.com") is False

    broken = MagicMock()
    broken.execute.side_effect = RuntimeError("db down")
    assert ca_mod._pipeline_job_running(broken) is False

    with patch("website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl", return_value=True), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._pipeline_job_running",
        return_value=False,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({"crawl_discovery_mode": "list", "crawl_url_list": ""}, []),
    ):
        out = ca_mod.prepare_audit_run(conn, Ctx(property_id=1), {"mode": "default", "start_url": "https://ex.com"})
    assert out.get("ready") is False
    assert "URL list is required" in out["errors"][0]

    with patch("website_profiling.tools.audit_tools.crawl.crawl_actions.load_llm_config_from_db", return_value={"llm_chat_allow_crawl": "true"}):
        assert ca_mod._chat_allow_crawl() is True

    with patch("website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl", return_value=True), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._pipeline_job_running",
        return_value=False,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({}, []),
    ):
        assert ca_mod.prepare_audit_run(conn, Ctx(), {"mode": "bogus", "start_url": "https://ex.com"})["errors"]
        assert ca_mod.prepare_audit_run(conn, Ctx(), {"mode": "default", "pipeline_mode": "bad", "start_url": "https://ex.com"})["errors"]
        assert ca_mod.prepare_audit_run(conn, Ctx(property_id=None), {"mode": "default", "start_url": ""})["ready"] is False
        create_bad = ca_mod.prepare_audit_run(
            conn, Ctx(), {"mode": "default", "create_property": {"site_url": "://invalid"}},
        )
        assert create_bad["ready"] is False
        with patch(
            "website_profiling.tools.audit_tools.crawl.crawl_actions.canonical_domain_from_start_url",
            return_value="",
        ):
            no_domain = ca_mod.prepare_audit_run(
                conn,
                Ctx(),
                {"mode": "default", "create_property": {"site_url": "https://example.com"}},
            )
        assert no_domain["ready"] is False
        no_url = ca_mod.prepare_audit_run(conn, Ctx(property_id=None), {"mode": "default"})
        assert no_url["ready"] is False

    prop = {"id": 9, "site_url": "https://ex.com", "default_crawl_preset": "starter"}
    with patch("website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl", return_value=True), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._pipeline_job_running",
        return_value=False,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.get_property_by_id",
        return_value=prop,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({}, []),
    ):
        out = ca_mod.prepare_audit_run(conn, Ctx(property_id=9), {"mode": "default"})
    assert out["ready"] is True
    assert out["run_spec"]["state"]["active_property_id"] == "9"

    with patch("website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl", return_value=True), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._pipeline_job_running",
        return_value=False,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({}, []),
    ):
        custom = ca_mod.prepare_audit_run(
            conn,
            Ctx(property_id=1),
            {
                "mode": "custom",
                "start_url": "https://ex.com",
                "config_overrides": {
                    "concurrency": "8",
                    "run_lighthouse_on_pages": True,
                    "bogus_key": "skip",
                    "crawl_render_mode": "invalid",
                },
            },
        )
    assert custom["ready"] is True
    assert any("Concurrency" in h for h in custom["summary"]["highlights"])
    with patch("website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl", return_value=True), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._pipeline_job_running",
        return_value=False,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({}, []),
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.get_property_by_id",
        return_value={"id": 4, "site_url": "https://prop.example.com"},
    ):
        from_url = ca_mod.prepare_audit_run(conn, Ctx(property_id=4), {"mode": "default"})
    assert from_url["ready"] is True
    assert from_url["summary"]["start_url"] == "https://prop.example.com"

    with patch("website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl", return_value=True), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._pipeline_job_running",
        return_value=False,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({}, []),
    ):
        lh = ca_mod.prepare_audit_run(
            conn,
            Ctx(property_id=1),
            {
                "mode": "custom",
                "start_url": "https://ex.com",
                "config_overrides": {"run_lighthouse_on_pages": "no"},
            },
        )
    assert lh["ready"] is True
    assert any("Lighthouse on pages: no" in h for h in lh["summary"]["highlights"])
    with patch("website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl", return_value=True), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._pipeline_job_running",
        return_value=False,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.get_property_by_id",
        return_value={"id": 5, "site_url": ""},
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({}, []),
    ):
        no_site = ca_mod.prepare_audit_run(conn, Ctx(property_id=5), {"mode": "default"})
    assert no_site["ready"] is False


# ---------------------------------------------------------------------------
# geo_citability
# ---------------------------------------------------------------------------

def test_citability_signal_branches() -> None:
    rec = {
        "content_excerpt": " ".join(["readable"] * 80),
        "html": "",
        "word_count": "n/a",
        "top_keywords": "solo",
        "heading_sequence": "h1,h2",
    }
    result = cit_mod._citability_signals(rec)
    assert result["word_count"] == 0
    assert result["signals"]["entity_richness"] == 1

    fluent = {
        "content_excerpt": " ".join(["word"] * 60),
        "html": "",
        "word_count": 60,
        "heading_sequence": "",
    }
    assert cit_mod._citability_signals(fluent)["signals"]["fluency"] in (3, 6, 10)


def test_citability_tool_handlers(conn: MagicMock, ctx: Ctx) -> None:
    df = pd.DataFrame([
        {
            "url": "https://ex.com/a",
            "status": "200",
            "content_excerpt": "According to Reuters, growth hit 25% in 2024.",
            "html": "https://www.reuters.com/story",
            "word_count": 400,
            "heading_sequence": "h1,h2",
            "top_keywords": ["growth"],
        }
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        site = cit_mod.get_citability_score(conn, ctx, {})
    assert site["total_pages"] == 1
    assert site["citability_score"] > 0

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        one = cit_mod.get_citability_for_url(conn, ctx, {"url": "https://ex.com/a"})
    assert one["url"] == "https://ex.com/a"
    assert one["provenance"] == "Estimated"

    assert cit_mod.get_citability_for_url(conn, ctx, {})["error"] == "url is required"
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        assert cit_mod.get_citability_for_url(conn, ctx, {"url": "https://ex.com/missing"})["error"] == "url not found in crawl"

    with patch.object(Ctx, "load_crawl_df", return_value=None):
        assert cit_mod.get_citability_score(conn, ctx, {})["missing"] is True
        assert cit_mod.get_citability_for_url(conn, ctx, {"url": "https://ex.com/a"})["error"] == "no crawl data"

    non_2xx = pd.DataFrame([{"url": "https://ex.com/x", "status": "404", "content_excerpt": "", "html": "", "word_count": 0}])
    with patch.object(Ctx, "load_crawl_df", return_value=non_2xx):
        empty_scores = cit_mod.get_citability_score(conn, ctx, {})
    assert empty_scores["total_pages"] == 0

    mid_fluency = {
        "content_excerpt": " ".join(["balanced"] * 50),
        "html": "",
        "word_count": 50,
        "heading_sequence": "",
    }
    with patch("website_profiling.tools.audit_tools.geo.geo_citability.flesch_kincaid_grade", return_value=6.5):
        assert cit_mod._citability_signals(mid_fluency)["signals"]["fluency"] == 6


# ---------------------------------------------------------------------------
# geo_detectors
# ---------------------------------------------------------------------------

def test_geo_detector_tools(conn: MagicMock, ctx: Ctx) -> None:
    df = _rich_crawl_df()
    with patch.object(Ctx, "load_crawl_df", return_value=df):
        neg = det_mod.get_negative_signals(conn, ctx, {"limit": 5})
    assert neg["total"] >= 1
    assert neg["signal_summary"]

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert det_mod.get_negative_signals(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        inj = det_mod.detect_prompt_injection(conn, ctx, {"limit": 5})
    assert inj["total"] >= 1
    assert inj["severity"] == "high"

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        rag = det_mod.get_rag_chunk_readiness(conn, ctx, {"limit": 5})
    assert rag["average_rag_score"] > 0
    assert rag["pages_above_60"] >= 0

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        decay = det_mod.get_content_decay_signals(conn, ctx, {"limit": 5})
    assert decay["pages_at_risk"] >= 0
    assert decay["pages"][0]["decay_types"]

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        mm = det_mod.get_multimodal_readiness(conn, ctx, {})
    assert mm["total_pages"] == 3
    assert mm["multimodal_readiness_score"] >= 0

    cluster_df = pd.DataFrame([
        {"url": "https://ex.com/widgets", "status": "200", "title": "Widget guide", "h1": "Widgets", "content_excerpt": "widgets pricing features", "word_count": 500},
        {"url": "https://ex.com/widget-faq", "status": "200", "title": "Widget FAQ", "h1": "Widgets FAQ", "content_excerpt": "widgets support pricing", "word_count": 450},
        {"url": "https://ex.com/other", "status": "200", "title": "Other topic", "h1": "Other", "content_excerpt": "unrelated content here", "word_count": 300},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=cluster_df):
        topics = det_mod.get_topic_authority(conn, ctx, {"limit": 5})
    assert topics["total_clusters"] >= 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame([cluster_df.iloc[0]])):
        sparse = det_mod.get_topic_authority(conn, ctx, {})
    assert sparse["note"] == "insufficient pages"


def test_negative_signal_variants() -> None:
    rec = {
        "url": "https://ex.com/post",
        "status": "200",
        "html": '<div class="lightbox">x</div>' + ("affiliate ref=1 " * 6),
        "content_excerpt": "widgets " * 12,
        "word_count": 80,
        "page_analysis": {"json_ld_types": ["NewsArticle"]},
    }
    signals = {s["signal"] for s in det_mod._check_negative_signals_for_page(rec)}
    assert "keyword_stuffing" in signals
    assert "popup_overlay" in signals
    assert "missing_author" in signals
    assert "affiliate_overload" in signals

    long_unstructured = {
        "url": "https://ex.com/long",
        "status": "200",
        "html": "<p>" + ("word " * 600) + "</p>",
        "content_excerpt": "word " * 600,
        "word_count": 600,
        "schema_json": None,
    }
    assert "no_structured_content" in {s["signal"] for s in det_mod._check_negative_signals_for_page(long_unstructured)}


# ---------------------------------------------------------------------------
# geo_list_tools + geo_tools
# ---------------------------------------------------------------------------

def test_robots_ai_access_score(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "resolve_property_domain", return_value=""):
        assert geo_list_mod.get_robots_ai_access_score(conn, ctx, {})["error"] == "domain unknown"

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch(
        "website_profiling.tools.audit_tools.geo.geo_list_tools._parse_robots_txt",
        return_value="",
    ):
        missing = geo_list_mod.get_robots_ai_access_score(conn, ctx, {})
    assert missing["missing"] is True

    robots = "User-agent: GPTBot\nDisallow: /private/\nUser-agent: *\nAllow: /\n"
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch(
        "website_profiling.tools.audit_tools.geo.geo_list_tools._parse_robots_txt",
        return_value=robots,
    ):
        scored = geo_list_mod.get_robots_ai_access_score(conn, ctx, {})
    assert scored["robots_score"] >= 0
    assert "per_bot" in scored


def test_geo_tools_depth_and_fetch_helpers() -> None:
    assert geo_mod._band(-1) == "Critical"
    depth_one_section = "# Title\n\n## Only\n\nhttps://a.com\n"
    d = geo_mod._score_llms_txt_depth(depth_one_section)
    assert d["section_count"] == 1
    assert d["depth_score"] >= 2

    many_links = "# S\n\n" + "\n".join(f"- https://ex.com/{i}" for i in range(12))
    assert geo_mod._score_llms_txt_depth(many_links)["depth_score"] >= 10

    mock_resp = MagicMock(status_code=200, text="# llms\n")
    with patch("website_profiling.tools.audit_tools.geo.geo_tools.requests.get", return_value=mock_resp):
        assert geo_mod._fetch_llms_full_txt("https://ex.com") is True

    with patch("website_profiling.tools.audit_tools.geo.geo_tools._fetch_llms_txt", return_value={"found": True, "depth": {}}), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._fetch_llms_full_txt",
        return_value=True,
    ), patch.object(Ctx, "resolve_property_domain", return_value="ex.com"):
        status = geo_mod.get_llms_txt_status(MagicMock(), Ctx(), {})
    assert status["llms_full_txt_found"] is True

    miss = MagicMock(status_code=404, text="")
    with patch("website_profiling.tools.audit_tools.geo.geo_tools.requests.get", return_value=miss):
        disc = geo_mod._fetch_ai_discovery("ex.com")
    assert disc["found_count"] == 0

    with patch("website_profiling.tools.audit_tools.geo.geo_tools.requests.get", side_effect=requests.RequestException("fail")):
        disc_err = geo_mod._fetch_ai_discovery("ex.com")
    assert disc_err["endpoints"]


def test_score_robots_ai_access_handles_request_error() -> None:
    """robots.txt fetch failure → unchecked result (covers the RequestException branch)."""
    with patch(
        "website_profiling.tools.audit_tools.geo.geo_tools.requests.get",
        side_effect=requests.RequestException("boom"),
    ):
        result = geo_mod._score_robots_ai_access("ex.com")
    assert result == {"robots_score": 0, "checked": False, "error": "robots.txt not reachable"}


# ---------------------------------------------------------------------------
# integration_tools
# ---------------------------------------------------------------------------

def test_check_ai_citations_live_paths(conn: MagicMock, ctx: Ctx) -> None:
    assert int_mod.check_ai_citations_live(conn, ctx, {})["error"] == "opt_in required"

    with patch.object(Ctx, "resolve_property_domain", return_value=""):
        assert int_mod.check_ai_citations_live(conn, ctx, {"opt_in": True})["error"] == "brand or property domain is required"

    fake_result = MagicMock()
    fake_result.to_dict.return_value = {"query": "q", "brand_mentioned": True, "domain_cited": False}
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch(
        "website_profiling.integrations.ai_citations.resolve_api_key",
        return_value="sk-test",
    ), patch(
        "website_profiling.integrations.ai_citations.check_citations",
        return_value=fake_result,
    ):
        live = int_mod.check_ai_citations_live(
            conn, ctx, {"opt_in": True, "brand": "Ex", "query": "What is Ex?", "multi_query": "Alt query"},
        )
    assert live["provenance"] == "Live"
    assert live["queries_run"] == 2
    assert live["brand_mentioned"] is True

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch(
        "website_profiling.integrations.ai_citations.resolve_api_key",
        return_value="sk-test",
    ), patch(
        "website_profiling.integrations.ai_citations.check_citations",
        side_effect=RuntimeError("api down"),
    ):
        err = int_mod.check_ai_citations_live(conn, ctx, {"opt_in": True, "brand": "Ex"})
    assert err["results"][0]["error"] == "api down"


# ---------------------------------------------------------------------------
# llm_tools generators
# ---------------------------------------------------------------------------

def test_llm_generator_tools(conn: MagicMock, ctx: Ctx) -> None:
    df = pd.DataFrame([
        {
            "url": "https://ex.com/faq",
            "title": "What is GEO?",
            "content_excerpt": "GEO means generative engine optimization.",
            "meta_description": "FAQ about GEO",
        },
        {
            "url": "https://ex.com/article",
            "title": "Article",
            "content_excerpt": "Body copy",
            "meta_description": "Article desc",
        },
    ])
    payload = {"site_name": "Ex", "categories": []}

    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response",
        return_value={},
    ), patch(
        "website_profiling.llm_client_http.complete_json",
        return_value=MagicMock(complete_json=MagicMock(return_value={"schema_json": {"@type": "WebSite", "name": "Ex"}})),
    ), patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}):
        schema = llm_mod.generate_schema(conn, ctx, {"schema_type": "FAQPage"})
        assert schema["schema_type"] == "FAQPage"
        article = llm_mod.generate_schema(conn, ctx, {"schema_type": "Article", "url": "https://ex.com/article"})
        assert article["schema_type"] == "Article"

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"):
        robots = llm_mod.generate_robots_txt(conn, ctx, {})
    assert "User-agent: GPTBot" in robots["robots_txt"]
    assert "Sitemap:" in robots["robots_txt"]

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        tags = llm_mod.generate_meta_tags(conn, ctx, {"url": "https://ex.com/faq"})
        assert "og:title" in tags["meta_tags_html"]
        assert llm_mod.generate_meta_tags(conn, ctx, {"url": "https://ex.com/missing"})["error"] == "url not found in crawl"

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch.object(
        Ctx, "load_payload", return_value=payload,
    ), patch.object(Ctx, "load_crawl_df", return_value=df), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools.draft_llms_txt",
        return_value={"llms_txt_draft": "# Ex"},
    ), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools.generate_robots_txt",
        return_value={"robots_txt": "Allow: /"},
    ), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools.generate_schema",
        side_effect=[{"schema_json": {}}, {"schema_json": {}}],
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._fetch_llms_txt",
        return_value={"found": False},
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._fetch_ai_discovery",
        return_value={"endpoints": {"ai_txt": {"found": False}}},
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._score_meta_signals",
        return_value={"has_meta_description": False},
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_list_tools._parse_robots_txt",
        return_value="User-agent: GPTBot\nDisallow: /\n",
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_list_tools._parse_robots_access",
        return_value={"gptbot": "blocked"},
    ):
        bundle = llm_mod.generate_geo_fix_bundle(conn, ctx, {})
    assert "llms.txt" in bundle["missing_files"]


# ---------------------------------------------------------------------------
# sql_query remaining branches
# ---------------------------------------------------------------------------

def test_sql_query_remaining_branches() -> None:
    with pytest.raises(ReadOnlyViolation, match="parse error"):
        assert_read_only("SELECT * FROM")

    with pytest.raises(ReadOnlyViolation, match="empty after parsing"):
        with patch("website_profiling.tools.audit_tools.core.sql_query.sqlglot.parse", return_value=[None]):
            assert_read_only("SELECT 1")

    with pytest.raises(ReadOnlyViolation, match="not permitted"):
        with patch("website_profiling.tools.audit_tools.core.sql_query.assert_read_only_regex"):
            assert_read_only("SELECT pg_sleep(1)")


def test_get_sql_schema_tuple_rows() -> None:
    col_rows = [
        ("crawl_runs", "id", "bigint", "NO", "PRIMARY KEY"),
        ("pipeline_jobs", "id", "uuid", "NO", "PRIMARY KEY"),
    ]
    fk_rows = [("crawl_runs", "property_id", "properties", "id")]

    class _FakeCursor:
        _call_count = 0

        def execute(self, sql: str) -> None:
            pass

        def fetchall(self):
            _FakeCursor._call_count += 1
            return col_rows if _FakeCursor._call_count == 1 else fk_rows

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

    class _FakeConn:
        def cursor(self):
            return _FakeCursor()

        def rollback(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

    from contextlib import contextmanager

    @contextmanager
    def _fake_ro():
        _FakeCursor._call_count = 0
        yield _FakeConn()

    with patch("website_profiling.tools.audit_tools.core.sql_query.readonly_session", _fake_ro):
        result = get_sql_schema(MagicMock(), Ctx(), {})
    tables = {t["table"]: t for t in result["tables"]}
    assert "crawl_runs" in tables
    assert tables["crawl_runs"]["foreign_keys"][0]["references_table"] == "properties"
    assert "pipeline_jobs" not in tables


def test_remaining_geo_and_llm_gaps(conn: MagicMock, ctx: Ctx) -> None:
    thin_boiler = {
        "url": "https://ex.com/footer",
        "status": "200",
        "html": "",
        "content_excerpt": "Home About Contact Privacy Policy Terms of Service Cookie Policy All rights reserved",
        "word_count": 120,
        "page_analysis": {},
    }
    assert "boilerplate_ratio" in {s["signal"] for s in det_mod._check_negative_signals_for_page(thin_boiler)}

    empty_df = pd.DataFrame()
    with patch.object(Ctx, "load_crawl_df", return_value=empty_df):
        assert det_mod.detect_prompt_injection(conn, ctx, {})["missing"] is True
        assert det_mod.get_rag_chunk_readiness(conn, ctx, {})["missing"] is True
        assert det_mod.get_content_decay_signals(conn, ctx, {})["missing"] is True
        assert det_mod.get_multimodal_readiness(conn, ctx, {})["missing"] is True
        assert det_mod.get_topic_authority(conn, ctx, {})["missing"] is True

    skip_df = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "404", "content_excerpt": "", "html": "", "word_count": 0},
        {"url": "https://ex.com/b", "status": "200", "content_excerpt": "", "html": "", "word_count": 0, "heading_sequence": ""},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=skip_df):
        assert det_mod.get_content_decay_signals(conn, ctx, {})["total"] == 0

    audio_df = pd.DataFrame([
        {
            "url": "https://ex.com/audio",
            "status": "200",
            "html": "<audio></audio>",
            "content_excerpt": "audio page",
            "word_count": 100,
            "page_analysis": {"json_ld_types": ["AudioObject"]},
        }
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=audio_df):
        mm = det_mod.get_multimodal_readiness(conn, ctx, {})
    assert mm["pages_with_audio_schema"] == 1

    huge_docs = pd.DataFrame([
        {
            "url": f"https://ex.com/topic-{i}",
            "status": "200",
            "title": f"widgets guide {i}",
            "h1": f"widgets {i}",
            "content_excerpt": "widgets pricing features support",
            "word_count": 500 - i,
        }
        for i in range(205)
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=huge_docs):
        capped = det_mod.get_topic_authority(conn, ctx, {"limit": 5})
    assert capped["total_pages"] == 200

    with patch("website_profiling.tools.audit_tools.geo.geo_tools.requests.get", side_effect=requests.RequestException("fail")):
        assert geo_mod._fetch_llms_full_txt("https://ex.com") is False

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._fetch_ai_discovery",
        return_value={"found_count": 1, "endpoints": {}, "discovery_score": 2},
    ):
        assert geo_mod.get_ai_discovery_status(conn, ctx, {})["found_count"] == 1

    ok = MagicMock(status_code=200, text='<?xml version="1.0"?><urlset><url><loc>https://ex.com</loc><lastmod>2024-01-01</lastmod></url></urlset>')
    feed = MagicMock(status_code=200, text='<?xml version="1.0"?><rss><channel><item/></channel></rss>')
    with patch("website_profiling.tools.audit_tools.geo.geo_tools.requests.get", side_effect=[ok, feed, feed, feed]):
        fresh = geo_mod._score_freshness_signals("ex.com")
    assert fresh["freshness_score"] > 0

    faq_rows = pd.DataFrame([
        {"url": f"https://ex.com/faq-{i}", "title": f"What is item {i}?", "content_excerpt": f"Answer {i}", "meta_description": ""}
        for i in range(12)
    ])
    with patch.object(Ctx, "load_payload", return_value={"site_name": "Ex"}), patch.object(Ctx, "load_crawl_df", return_value=faq_rows), patch(
        "website_profiling.tools.audit_tools.integrations.llm_tools._llm_disabled_response",
        return_value={},
    ), patch(
        "website_profiling.llm_client_http.complete_json",
        return_value=MagicMock(complete_json=MagicMock(side_effect=RuntimeError("llm down"))),
    ), patch("website_profiling.llm_config.load_llm_config_from_db", return_value={}):
        faq_schema = llm_mod.generate_schema(conn, ctx, {"schema_type": "FAQPage"})
    assert len(faq_schema["schema_json"]["mainEntity"]) == 10

    assert run_sql_query(MagicMock(), Ctx(), {})["error"] == "sql argument is required."
    col_rows = [("crawl_runs", "id", "bigint", "NO", "PRIMARY KEY")]
    fk_rows = [("pipeline_jobs", "id", "properties", "id")]

    class _FakeCursor:
        _call_count = 0

        def execute(self, sql: str) -> None:
            pass

        def fetchall(self):
            _FakeCursor._call_count += 1
            return col_rows if _FakeCursor._call_count == 1 else fk_rows

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

    class _FakeConn:
        def cursor(self):
            return _FakeCursor()

        def rollback(self):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_):
            pass

    from contextlib import contextmanager

    @contextmanager
    def _fake_ro():
        _FakeCursor._call_count = 0
        yield _FakeConn()

    with patch("website_profiling.tools.audit_tools.core.sql_query.readonly_session", _fake_ro):
        schema = get_sql_schema(MagicMock(), Ctx(), {})
    assert schema["tables"][0]["table"] == "crawl_runs"
    assert schema["tables"][0]["foreign_keys"] == []

    anchor_df = pd.DataFrame([
        {
            "url": "https://ex.com/guide",
            "status": "200",
            "title": "Guide",
            "content_excerpt": "Python is a high-level programming language that enables rapid development across teams.",
            "html": "<h2>Intro</h2><h2>Details</h2><h3>More</h3>",
            "word_count": 500,
            "heading_sequence": "h1,h2,h3",
        }
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=anchor_df):
        rag = det_mod.get_rag_chunk_readiness(conn, ctx, {})
    assert rag["pages"][0]["has_anchor_sentence"] is True

    video_df = pd.DataFrame([
        {
            "url": "https://ex.com/watch",
            "status": "200",
            "html": "<img alt='still frame' src='v.png'>",
            "content_excerpt": "watch page",
            "word_count": 100,
            "page_analysis": {"json_ld_types": ["VideoObject"]},
        }
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=video_df):
        vid = det_mod.get_multimodal_readiness(conn, ctx, {})
    assert vid["pages_with_video_schema"] == 1

    mixed_docs = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "404", "title": "", "h1": "", "content_excerpt": "", "word_count": "bad"},
        {"url": "https://ex.com/b", "status": "200", "title": "widgets guide", "h1": "widgets", "content_excerpt": "widgets pricing", "word_count": 400},
        {"url": "https://ex.com/c", "status": "200", "title": "widgets faq", "h1": "widgets faq", "content_excerpt": "widgets support", "word_count": "bad"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=mixed_docs):
        topics = det_mod.get_topic_authority(conn, ctx, {})
    assert topics["total_pages"] >= 2

    readiness_df = pd.DataFrame([
        {
            "url": "https://ex.com/list",
            "status": "200",
            "word_count": 400,
            "heading_sequence": "h1,h2",
            "content_excerpt": "- bullet one\n- bullet two",
            "html": "<ul><li>a</li></ul>",
            "page_analysis": {"json_ld_types": ["Organization"]},
        }
    ])
    with patch.object(Ctx, "load_payload", return_value={"ner_site_summary": {"entities": ["Ex"]}}), patch.object(
        Ctx, "load_crawl_df", return_value=readiness_df,
    ), patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._fetch_llms_txt",
        return_value={"found": False},
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._score_robots_ai_access",
        return_value={"robots_score": 5},
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._score_meta_signals",
        return_value={"meta_score": 5},
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._score_freshness_signals",
        return_value={"freshness_score": 4},
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools._fetch_ai_discovery",
        return_value={"discovery_score": 2},
    ), patch(
        "website_profiling.tools.audit_tools.geo.geo_tools.get_faq_schema_coverage",
        return_value={"coverage_pct": 50},
    ):
        score = geo_mod.get_geo_readiness_score(conn, ctx, {})
    assert score["geo_readiness_score"] >= 0
