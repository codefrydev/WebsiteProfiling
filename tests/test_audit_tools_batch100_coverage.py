"""100% line-coverage tests for batch-100 audit list tool modules."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest
import requests

from website_profiling.tools.audit_tools import crawl as crawl_mod
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.audit_tools import issue_lists as issue_mod
from website_profiling.tools.audit_tools import google_lists as google_mod
from website_profiling.tools.audit_tools import keyword_lists as kw_mod
from website_profiling.tools.audit_tools import backlink_lists as bl_mod
from website_profiling.tools.audit_tools import content_lists as content_mod
from website_profiling.tools.audit_tools import link_lists as link_mod
from website_profiling.tools.audit_tools import indexation_lists as idx_mod
from website_profiling.tools.audit_tools import compare_list_tools as cmp_mod
from website_profiling.tools.audit_tools import geo_list_tools as geo_list_mod


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


@pytest.fixture
def ctx() -> Ctx:
    return Ctx(property_id=1, report_id=1)


def _payload() -> dict:
    return {
        "start_url": "https://ex.com/",
        "origin": "https://ex.com/",
        "orphan_urls": ["https://ex.com/orphan", "https://ex.com/hub-target"],
        "top_pages": [
            {"url": "https://ex.com/", "inlinks": 5, "pagerank": 0.05, "outlinks": 2},
            {"url": "https://ex.com/blog/post", "inlinks": 1, "pagerank": 0.001, "outlinks": 1},
        ],
        "links": [{"url": "https://ex.com/orphan", "inlinks": 0}],
        "graph_nodes": [
            {"url": "https://ex.com/hub", "id": "hub"},
            "https://ex.com/orphan",
        ],
        "graph_edges": [
            [0, 1],
            {"source": "https://ex.com/hub", "target": "https://ex.com/orphan"},
        ],
        "link_edges": [
            {
                "from_url": "https://ex.com/",
                "to_url": "https://external.com/page",
                "link_type": "external",
                "anchor_text": "ext",
                "rel": "nofollow",
                "is_nofollow": True,
            },
            {
                "from_url": "https://ex.com/",
                "to_url": "https://ex.com/about",
                "link_type": "internal",
                "anchor_text": "about",
                "rel": "",
                "is_nofollow": False,
            },
            {
                "from_url": "https://ex.com/about",
                "to_url": "https://ex.com/",
                "link_type": "internal",
                "anchor_text": "home",
                "rel": "ugc nofollow",
                "is_nofollow": True,
            },
        ],
        "content_urls": {
            "title_short": [{"url": "https://ex.com/short", "title": "Hi", "title_length": 2}],
            "title_long": [{"url": "https://ex.com/long", "title": "x" * 80, "title_length": 80}],
            "slow_response": [{"url": "https://ex.com/slow", "response_time_ms": 5000, "status": "200"}],
            "missing_html_lang": [{"url": "https://ex.com/nolang"}],
            "invalid_viewport": [{"url": "https://ex.com/badvp"}],
            "high_reading_level": [{"url": "https://ex.com/hard", "reading_level": 14}],
            "very_thin_content": [{"url": "https://ex.com/thin", "word_count": 50}],
        },
        "hreflang_issue_urls": [{"url": "https://ex.com/href", "message": "missing return"}],
        "lighthouse_failure_urls": {
            "lcp": ["https://ex.com/lcp-fail"],
            "inp": ["https://ex.com/inp-fail"],
            "cls": ["https://ex.com/cls-fail"],
            "seo": ["https://ex.com/seo-fail"],
        },
        "optional_audit_urls": {
            "spell": [{"url": "https://ex.com/spell", "message": "typo"}],
            "html": [{"url": "https://ex.com/html", "message": "invalid html"}],
            "amp": [{"url": "https://ex.com/amp", "message": "amp error"}],
            "pagination": [{"url": "https://ex.com/pag", "message": "pagination rel=next"}],
        },
        "indexation_coverage": {
            "lists": {
                "sitemap_only": ["https://ex.com/sitemap-only", "https://ex.com/s2"],
                "crawled_not_in_sitemap": ["https://ex.com/crawl-only"],
            },
            "lists_total": {"sitemap_only": 2, "crawled_not_in_sitemap": 1},
        },
        "social_coverage": {
            "missing_og": ["https://ex.com/no-og"],
            "missing_twitter": ["https://ex.com/no-tw"],
        },
        "language_summary": {"counts": {"en": 8, "fr": 2}},
        "text_content_analysis": {
            "keyword_index": [
                {
                    "word": "widgets",
                    "top_pages": [
                        {"url": "https://ex.com/", "count": 3},
                        ["https://ex.com/about", 2],
                        "skip",
                    ],
                }
            ],
        },
        "content_analytics": {"keyword_index": [{"word": "fallback", "top_pages": []}]},
        "content_duplicates": [
            {
                "id": "c1",
                "representative_url": "https://ex.com/a",
                "member_urls": ["https://ex.com/a", "https://ex.com/b"],
                "similarity": 0.95,
            },
            "skip",
        ],
        "rich_results_validation": [
            {"url": "https://ex.com/", "status": "pass", "type": "Organization"},
            {"url": "https://ex.com/bad", "status": "fail", "schema_type": "FAQPage", "message": "invalid"},
        ],
        "semantic_keyword_clusters": [
            {"top_keyword": "widgets", "keywords": ["widgets", "widget repair"], "cluster_score": 0.8},
        ],
        "issues": {
            "seo": [
                {"type": "missing_title", "url": "https://ex.com/x", "message": "Missing title"},
                {"type": "OTHER", "url": "https://ex.com/y"},
                "skip",
            ],
        },
        "categories": [
            {
                "issues": [
                    {"message": "Spell check found typo on page"},
                    {"message": "HTML markup validation failed"},
                    {"message": "AMP validation issue detected"},
                    {"message": "pagination rel=prev missing on series"},
                    {"message": "custom audit needle found"},
                ],
            },
            "skip",
        ],
        "lighthouse_by_url": {
            "https://ex.com/lcp-live": {
                "lcp": 4.5,
                "cwv_failures": "lcp",
                "top_failures": [{"id": "largest-contentful-paint"}],
                "audits": {"lcp": {"score": 0.5, "title": "LCP slow"}},
            },
            "https://ex.com/inp-live": {
                "inp": 500,
                "top_failures": [{"id": "interaction-to-next-paint"}],
            },
            "https://ex.com/cls-live": {"cls": 0.3, "cwv_failures": "cls"},
            "https://ex.com/seo-live": {"seo": 55, "audits": {"seo": {"score": 0.6, "title": "SEO"}}},
            "https://ex.com/contrast": {
                "audits": {
                    "color-contrast": {"score": 0.5, "title": "Contrast"},
                },
            },
        },
        "google": {
            "fetched_at": "2026-06-01",
            "gsc": {
                "daily": [
                    {"query": "widgets", "date": "2026-06-01", "clicks": 1},
                    {"page": "https://ex.com/", "date": "2026-06-01", "clicks": 2},
                ],
            },
            "gsc_full": {
                "summary": {"clicks": 100, "impressions": 1000, "ctr": 0.1, "position": 5},
                "pages": [
                    {"page": "https://ex.com/", "clicks": 50, "impressions": 500, "ctr": "0.5%", "position": 5},
                    {"page": "https://ex.com/low-ctr", "clicks": 1, "impressions": 800, "ctr": "0.1%", "position": 4},
                    {"page": "https://ex.com/high-ctr", "clicks": 100, "impressions": 500, "ctr": "20%", "position": 3},
                    {"page": "https://ex.com/band", "clicks": 5, "impressions": 100, "ctr": "5%", "position": 12},
                ],
                "queries": [
                    {"query": "widgets", "clicks": 10, "impressions": 200, "position": 6},
                    {"query": "new query", "clicks": 2, "impressions": 50, "position": 8},
                ],
                "daily": [
                    {"query": "widgets", "date": "2026-06-01", "clicks": 1},
                    {"page": "https://ex.com/", "date": "2026-06-01", "clicks": 2},
                ],
            },
            "ga4_full": {
                "summary": {"sessions": 200, "users": 150},
                "top_pages": [
                    {"path": "/", "sessions": 100, "bounceRate": 0.8, "engagementRate": 0.2},
                    {"path": "/mismatch", "sessions": 50, "bounceRate": 0.9, "engagementRate": 0.1},
                ],
                "by_path": {
                    "/alt": {"sessions": 30, "bounceRate": 0.7, "engagementRate": 0.3},
                },
                "daily": [{"path": "/", "date": "2026-06-01", "sessions": 10}],
            },
        },
    }


def _prior_google() -> dict:
    return {
        "fetched_at": "2026-05-01",
        "gsc_full": {
            "summary": {"clicks": 80, "impressions": 900, "ctr": 0.09, "position": 6},
            "pages": [
                {"page": "https://ex.com/", "clicks": 60, "impressions": 400, "position": 4},
                {"page": "https://ex.com/loser", "clicks": 30, "impressions": 200, "position": 5},
            ],
            "queries": [
                {"query": "widgets", "clicks": 15, "impressions": 180, "position": 4},
                {"query": "old query", "clicks": 5, "impressions": 40, "position": 12},
            ],
        },
        "ga4_full": {"summary": {"sessions": 180, "users": 140}},
    }


def _google_mismatch() -> dict:
    data = _payload()["google"].copy()
    data["gsc"] = {
        "daily": [
            {"page": "https://ex.com/", "date": "2026-06-01", "clicks": 2},
            {"page": "https://ex.com/mismatch-gsc", "date": "2026-06-01", "clicks": 1},
        ],
    }
    gsc = dict(data["gsc_full"])
    ga4 = dict(data["ga4_full"])
    gsc["by_page"] = {
        "https://ex.com/mismatch-gsc": {"clicks": 20, "impressions": 100},
        "https://ex.com/ga4-only": {"clicks": 0, "impressions": 0},
    }
    ga4["by_path"] = {
        "/mismatch-gsc": {"sessions": 0},
        "/ga4-only": {"sessions": 25},
        "/ratio-high": {"sessions": 60},
    }
    gsc["pages"] = list(gsc["pages"]) + [
        {"page": "https://ex.com/mismatch-gsc", "clicks": 20, "impressions": 100, "position": 5},
        {"page": "https://ex.com/ga4-only", "clicks": 0, "impressions": 0, "position": 10},
        {"page": "https://ex.com/ratio-high", "clicks": 10, "impressions": 50, "position": 6},
    ]
    data["gsc_full"] = gsc
    data["ga4_full"] = ga4
    return data


def _keyword_data() -> dict:
    return {
        "fetched_at": "2026-06-01",
        "rows": [
            {
                "keyword": "widgets",
                "gsc_position": 8,
                "gsc_clicks": 0,
                "gsc_impressions": 500,
                "gsc_url": "https://ex.com/",
                "recommended_action": "Improve CTR",
                "serp_features": ["ai_overview", "faq"],
                "serp_estimated_competition": 45,
                "is_branded": True,
                "is_question": True,
                "intent": "commercial",
                "score": 10,
                "traffic_potential": 200,
            },
            {
                "keyword": "repair service",
                "gsc_position": 15,
                "gsc_clicks": 0,
                "gsc_impressions": 200,
                "gsc_url": "https://ex.com/about",
                "recommended_action": "Create content",
                "serp_features": "local_pack",
                "serp_estimated_competition": 70,
                "is_branded": False,
                "is_question": False,
                "intent": "transactional",
            },
            {
                "keyword": "near page one",
                "gsc_position": 11,
                "gsc_clicks": 2,
                "gsc_impressions": 100,
                "gsc_url": "https://ex.com/near",
            },
            {
                "keyword": "bad position",
                "gsc_position": "bad",
                "gsc_clicks": 1,
                "gsc_impressions": 10,
            },
        ],
        "cannibalisation": [
            {
                "query": "widgets",
                "pages": [
                    {"url": "https://ex.com/a", "position": 5, "clicks": 3, "impressions": 50},
                    {"url": "https://ex.com/b", "position": 8, "clicks": 1, "impressions": 20},
                    "skip",
                ],
            },
            "skip",
        ],
        "query_page_misalignment": [{"keyword": "buy widgets", "url": "https://ex.com/wrong"}],
        "semantic_keyword_clusters": [{"top_keyword": "widgets", "keywords": ["widgets"]}],
    }


def _prior_keywords() -> dict:
    return {
        "rows": [
            {"keyword": "widgets", "gsc_position": 12, "gsc_impressions": 150},
            {"keyword": "repair service", "gsc_position": 8, "gsc_impressions": 100},
            {"keyword": "old top ten", "gsc_position": 9, "gsc_impressions": 80},
            {"keyword": "fell out", "gsc_position": 5, "gsc_impressions": 60},
        ],
    }


def _gsc_links() -> dict:
    return {
        "top_linking_sites": [{"site": "partner.com", "link_count": 5}],
        "top_linking_text": [{"anchor_text": "widgets", "link_count": 3}],
        "sample_links": [
            {
                "linking_site": "partner.com",
                "source_page": "https://partner.com/page",
                "target_page": "https://ex.com/",
                "target_url_on_linking_page": "https://ex.com/",
                "anchor_text": "Best widgets",
            },
            {
                "source_page": "https://www.other.org/ref",
                "target_page": "https://ex.com/about",
                "anchor_text": "About us",
            },
        ],
        "latest_links": [
            {
                "linking_site": "fresh.com",
                "target_page": "https://ex.com/new",
                "anchor_text": "fresh link",
            },
        ],
    }


def _crawl_df() -> pd.DataFrame:
    return pd.DataFrame([
        {
            "url": "https://ex.com/",
            "status": "200",
            "title": "Home page with widgets",
            "title_length": 25,
            "meta_description": "desc",
            "h1": "Home",
            "word_count": 400,
            "reading_level": 8,
            "response_time_ms": 100,
            "viewport_present": "true",
            "viewport_content": "width=device-width",
            "og_title": "OG Home",
            "twitter_card": "summary",
            "has_schema": "true",
            "detected_language": "en",
            "fetch_method": "static",
            "content_excerpt": "Widgets are tools that means something useful.",
            "html": "<li>item</li>",
            "page_analysis": json.dumps({
                "html_lang": "en",
                "json_ld_types": ["Organization", "FAQPage"],
                "hreflang_alternates": [
                    {"hreflang": "en", "href": "https://ex.com/other"},
                    {"hreflang": "fr", "href": "https://ex.com/fr"},
                ],
                "browser": {
                    "console": [{"type": "error", "text": "Uncaught Error"}],
                    "page_errors": [{"message": "ReferenceError"}],
                    "failed_requests": [{"url": "https://ex.com/missing.js"}],
                },
            }),
        },
        {
            "url": "https://ex.com/",
            "status": "200",
            "title": "Home rendered",
            "h1": "Home R",
            "word_count": 500,
            "fetch_method": "rendered",
            "page_analysis": "{}",
        },
        {
            "url": "https://ex.com/fr",
            "status": "200",
            "title": "French",
            "detected_language": "fr",
            "word_count": 300,
            "page_analysis": json.dumps({
                "hreflang_alternates": [{"hreflang": "fr", "href": "https://ex.com/fr"}],
            }),
        },
        {
            "url": "https://ex.com/other",
            "status": "200",
            "title": "Other EN",
            "detected_language": "en",
            "word_count": 250,
            "page_analysis": json.dumps({
                "hreflang_alternates": [{"hreflang": "en", "href": "https://ex.com/other"}],
            }),
        },
        {
            "url": "https://ex.com/short-crawl",
            "status": "200",
            "title": "Short",
            "title_length": 5,
            "word_count": 80,
            "reading_level": "bad",
            "response_time_ms": "bad",
            "viewport_present": "true",
            "viewport_content": "broken",
            "og_title": "",
            "twitter_card": "",
            "has_schema": "true",
            "page_analysis": json.dumps({"json_ld_types": []}),
        },
        {
            "url": "https://ex.com/slow-crawl",
            "status": "200",
            "title": "Slow page title here",
            "title_length": 35,
            "response_time_ms": 3000,
            "word_count": 60,
            "reading_level": 13,
            "viewport_present": "false",
            "page_analysis": json.dumps({"html_lang": ""}),
        },
        {
            "url": "https://ex.com/blog/how-to-fix-widgets",
            "status": "200",
            "title": "How to fix widgets step-by-step",
            "h1": "How to fix widgets",
            "word_count": 350,
            "content_excerpt": "Posted by author on Monday. " + ("word " * 220),
            "page_analysis": json.dumps({"json_ld_types": ["WebPage"]}),
        },
        {
            "url": "https://ex.com/guide/tutorial",
            "status": "200",
            "title": "Tutorial guide",
            "word_count": 280,
            "content_excerpt": "- step one\n- step two\nWidgets are devices.",
            "html": "<ul><li>one</li></ul>",
            "page_analysis": json.dumps({"json_ld_types": ["HowTo"]}),
        },
        {
            "url": "https://ex.com/redirect",
            "status": "301",
            "redirect_chain_length": 4,
            "final_url": "https://ex.com/final",
            "page_analysis": "{}",
        },
        {
            "url": "https://ex.com/href-dup",
            "status": "200",
            "page_analysis": json.dumps({
                "hreflang_alternates": [
                    {"hreflang": "en", "href": "https://ex.com/href-dup"},
                    {"hreflang": "en", "href": "https://ex.com/href-dup-2"},
                ],
            }),
        },
        {
            "url": "https://ex.com/href-self",
            "status": "200",
            "page_analysis": json.dumps({
                "hreflang_alternates": [{"hreflang": "de", "href": "https://ex.com/de-only"}],
            }),
        },
        {
            "url": "https://ex.com/console",
            "status": "200",
            "page_analysis": json.dumps({
                "console_errors": ["raw error", {"type": "warning", "message": "warn"}],
                "js_errors": [{"level": "error", "text": "js fail"}],
            }),
        },
        {
            "url": "https://ex.com/404",
            "status": "404",
            "word_count": 10,
            "page_analysis": "{}",
        },
    ])


def _log_row() -> dict:
    return {
        "upload_id": 7,
        "filename": "access.log",
        "analysis": {
            "top_paths": [
                {"path": "/orphan", "hits": 50},
                {"path": "/popular", "hits": 100},
                {"path": "/quiet", "hits": 5},
            ],
            "googlebot_paths": [{"path": "/popular", "hits": 2}],
            "paths_5xx": [],
            "status_counts": {"500": 12, "503": 3},
        },
    }


def _compare_current() -> dict:
    return {
        "report_generated_at": "2026-06-07",
        "google": _google_mismatch(),
        "categories": [{"issues": [{"message": "New issue", "url": "https://ex.com/new"}]}],
        "lighthouse_by_url": {
            "https://ex.com/": {"performance": 70, "seo": 80},
            "https://ex.com/regressed": {"performance": 50, "seo": 60},
        },
        "links": [{"url": "https://ex.com/"}, {"url": "https://ex.com/new"}],
    }


def _compare_baseline() -> dict:
    return {
        "report_generated_at": "2026-05-01",
        "google": _prior_google(),
        "categories": [{"issues": [{"message": "Old issue", "url": "https://ex.com/old"}]}],
        "lighthouse_by_url": {
            "https://ex.com/": {"performance": 80, "seo": 85},
            "https://ex.com/regressed": {"performance": 70, "seo": 75},
        },
        "links": [{"url": "https://ex.com/"}, {"url": "https://ex.com/removed"}],
    }


def test_issue_lists_all_paths(conn: MagicMock, ctx: Ctx) -> None:
    empty_df = pd.DataFrame()
    with patch.object(Ctx, "load_payload", return_value=None), patch.object(Ctx, "load_crawl_df", return_value=empty_df):
        assert issue_mod.list_pages_title_too_short(conn, ctx, {})["total"] == 0
        assert issue_mod.list_pages_color_contrast_failures(conn, ctx, {})["error"]
        assert issue_mod.list_orphan_hub_suggestions(conn, ctx, {})["error"]
        assert issue_mod.list_lighthouse_failure_seo(conn, ctx, {})["error"]

    with patch.object(Ctx, "load_payload", return_value={"content_urls": "bad"}):
        assert issue_mod.list_pages_title_too_short(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_payload", return_value={"content_urls": {"title_short": "bad"}}):
        out = issue_mod.list_pages_title_too_short(conn, ctx, {})
        assert out["total"] == 0

    payload = _payload()
    df = _crawl_df()
    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert issue_mod.list_pages_title_too_short(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_title_too_long(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_slow_response(conn, ctx, {"threshold_ms": "bad"})["total"] >= 1
        assert issue_mod.list_pages_missing_html_lang(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_invalid_viewport(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_high_reading_level(conn, ctx, {"min_reading_level": "bad"})["total"] >= 1
        assert issue_mod.list_pages_very_thin_content(conn, ctx, {"max_word_count": "bad"})["total"] >= 1
        assert issue_mod.list_hreflang_issue_pages(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_missing_og_tags(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_missing_twitter_cards(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_invalid_json_ld(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_mixed_language(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_orphan_hub_suggestions(conn, ctx, {})["total"] >= 0
        assert issue_mod.list_lighthouse_failure_lcp(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_lighthouse_failure_inp(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_lighthouse_failure_cls(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_lighthouse_failure_seo(conn, ctx, {"seo_threshold": "bad"})["total"] >= 1
        contrast = issue_mod.list_pages_color_contrast_failures(conn, ctx, {})
        assert contrast["total"] >= 0

    empty_payload = {"hreflang_issue_urls": [], "issues": {"seo": "bad"}}
    with patch.object(Ctx, "load_payload", return_value=empty_payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert issue_mod.list_hreflang_issue_pages(conn, ctx, {})["total"] >= 1

    no_bucket = {"content_urls": {}, "social_coverage": {}}
    with patch.object(Ctx, "load_payload", return_value=no_bucket), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert issue_mod.list_pages_title_too_short(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_missing_og_tags(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_missing_twitter_cards(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_very_thin_content(conn, ctx, {})["total"] >= 1

    lh_payload = {
        "lighthouse_failure_urls": {},
        "lighthouse_by_url": {
            "https://ex.com/x": {"seo": 50, "audits": {"seo": {"score": 0.5, "title": "SEO"}}},
            "bad": "skip",
        },
    }
    with patch.object(Ctx, "load_payload", return_value=lh_payload):
        assert issue_mod.list_lighthouse_failure_lcp(conn, ctx, {})["total"] == 0
        assert issue_mod.list_lighthouse_failure_seo(conn, ctx, {})["total"] >= 1

    no_lang = {"language_summary": {}}
    with patch.object(Ctx, "load_payload", return_value=no_lang), patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert issue_mod.list_pages_mixed_language(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_payload", return_value={"orphan_urls": "bad", "graph_edges": []}), patch.object(
        Ctx, "load_crawl_df", return_value=df,
    ):
        assert issue_mod.list_orphan_hub_suggestions(conn, ctx, {})["total"] == 0


def test_google_lists_all_paths(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_google_full", return_value=None), patch.object(Ctx, "load_google", return_value=None):
        assert google_mod.list_gsc_pages_by_impressions(conn, ctx, {})["missing"] is True
        assert google_mod.get_gsc_query_trend(conn, ctx, {"query": "x"})["missing"] is True
        assert google_mod.get_gsc_page_trend(conn, ctx, {"url": "https://ex.com"})["missing"] is True
        assert google_mod.get_ga4_path_trend(conn, ctx, {"path": "/"})["missing"] is True

    assert google_mod.get_gsc_query_trend(conn, ctx, {})["error"] == "query is required"
    assert google_mod.get_gsc_page_trend(conn, ctx, {})["error"] == "url is required"
    assert google_mod.get_ga4_path_trend(conn, ctx, {})["error"] == "path is required"

    google = _google_mismatch()
    with patch.object(Ctx, "load_google_full", return_value=google), patch.object(Ctx, "load_google", return_value=google):
        assert google_mod.list_gsc_pages_by_impressions(conn, ctx, {})["total"] >= 1
        assert google_mod.list_gsc_pages_by_clicks(conn, ctx, {})["total"] >= 1
        assert google_mod.list_gsc_queries_by_impressions(conn, ctx, {})["total"] >= 1
        assert google_mod.list_gsc_queries_by_clicks(conn, ctx, {})["total"] >= 1
        assert google_mod.list_gsc_ctr_underperformers(conn, ctx, {})["total"] >= 0
        assert google_mod.list_ga4_landing_pages(conn, ctx, {})["total"] >= 1
        assert google_mod.list_ga4_pages_by_bounce_rate(conn, ctx, {})["total"] >= 1
        assert google_mod.list_ga4_pages_by_engagement_rate(conn, ctx, {})["total"] >= 1
        trend = google_mod.get_gsc_query_trend(conn, ctx, {"query": "widgets"})
        assert trend.get("daily") or trend.get("snapshot")
        assert google_mod.get_gsc_page_trend(conn, ctx, {"url": "https://ex.com/"})["daily"]
        assert google_mod.get_ga4_path_trend(conn, ctx, {"url": "https://ex.com/alt"})["path"] == "/alt"
        assert google_mod.list_gsc_ga4_mismatch_pages(conn, ctx, {})["total"] >= 1
        assert google_mod.list_gsc_pages_by_position_band(conn, ctx, {"min_position": "bad"})["total"] >= 1
        assert google_mod.get_gsc_site_benchmarks(conn, ctx, {})["page_count"] >= 1

    top_key = {"gsc_full": {"top_pages": [{"page": "https://ex.com/top", "impressions": 99}]}}
    with patch.object(Ctx, "load_google_full", return_value=top_key):
        assert google_mod.list_gsc_pages_by_impressions(conn, ctx, {})["total"] == 1

    no_daily = {"gsc_full": {"queries": [{"query": "only", "clicks": 1}]}}
    with patch.object(Ctx, "load_google_full", return_value=no_daily):
        snap = google_mod.get_gsc_query_trend(conn, ctx, {"query": "only"})
        assert snap.get("snapshot")

    with patch.object(Ctx, "load_keywords", return_value=_keyword_data()):
        assert google_mod.list_gsc_branded_queries(conn, ctx, {})["total"] >= 1
        assert google_mod.list_gsc_non_branded_queries(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_keywords", return_value=None):
        assert google_mod.list_gsc_branded_queries(conn, ctx, {})["missing"] is True

    current, prior = _google_mismatch(), _prior_google()
    with patch.object(google_mod, "_load_google_pair", return_value=(current, prior)):
        assert google_mod.list_gsc_decaying_pages(conn, ctx, {})["total"] >= 0
        assert google_mod.list_gsc_decaying_queries(conn, ctx, {})["total"] >= 0
        assert google_mod.list_gsc_new_queries(conn, ctx, {})["total"] >= 1
        assert google_mod.compare_gsc_periods(conn, ctx, {})["gsc"]["clicks"]["delta"] != 0

    with patch.object(google_mod, "_load_google_pair", return_value=(current, None)):
        assert google_mod.list_gsc_decaying_pages(conn, ctx, {})["missing"] is True
        assert google_mod.compare_gsc_periods(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_google_pair", return_value=(current, None)), patch(
        "website_profiling.integrations.google.store.read_prior_google_snapshot",
        return_value=prior,
    ):
        cur, pr = google_mod._load_google_pair(ctx, conn)
        assert pr is not None

    with patch.object(Ctx, "load_google_pair", return_value=(current, None)), patch(
        "website_profiling.integrations.google.store.read_prior_google_snapshot",
        side_effect=RuntimeError("fail"),
    ):
        conn.execute.return_value.fetchall.return_value = [{"data": prior}, {"data": prior}]
        cur2, pr2 = google_mod._load_google_pair(ctx, conn)
        assert pr2 is not None

    with patch.object(Ctx, "load_google_pair", return_value=(current, None)), patch(
        "website_profiling.integrations.google.store.read_prior_google_snapshot",
        side_effect=RuntimeError("fail"),
    ), patch.object(conn, "execute", side_effect=RuntimeError("db fail")):
        cur3, pr3 = google_mod._load_google_pair(ctx, conn)
        assert pr3 is None

    no_prop = Ctx(property_id=None, report_id=1)
    with patch.object(Ctx, "load_google_pair", return_value=(current, prior)):
        cur4, pr4 = google_mod._load_google_pair(no_prop, conn)
        assert pr4 is prior


def test_keyword_lists_all_paths(conn: MagicMock, ctx: Ctx) -> None:
    no_prop = Ctx(property_id=None, report_id=1)
    assert kw_mod.list_keyword_rank_improvements(conn, no_prop, {})["missing"] is True
    assert kw_mod.list_keywords_by_recommended_action(conn, ctx, {})["error"]
    assert kw_mod.list_keywords_by_serp_feature(conn, ctx, {})["error"]
    assert kw_mod.get_keyword_opportunity_score(conn, ctx, {})["error"] == "keyword is required"
    assert kw_mod.get_keyword_serp_snapshot(conn, ctx, {})["error"] == "keyword is required"
    assert kw_mod.list_keywords_near_page_one(conn, ctx, {"min_position": "bad"})["error"]

    kw = _keyword_data()
    prior = _prior_keywords()
    payload = _payload()
    with patch.object(Ctx, "load_keywords", return_value=kw), patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.keyword_lists.read_keyword_snapshots_for_property",
        return_value=[kw, prior],
    ):
        assert kw_mod.list_keyword_rank_improvements(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_keyword_rank_declines(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_keywords_new_to_top_10(conn, ctx, {})["total"] >= 0
        assert kw_mod.list_keywords_fell_out_of_top_10(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_cannibalisation_queries(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_cannibalisation_urls(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_misaligned_queries(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_keywords_by_recommended_action(conn, ctx, {"recommended_action": "Improve"})["total"] >= 1
        assert kw_mod.list_keywords_by_serp_feature(conn, ctx, {"serp_feature": "local"})["total"] >= 1
        assert kw_mod.list_semantic_cluster_queries(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_semantic_cluster_pages(conn, ctx, {})["total"] >= 1
        assert kw_mod.get_keyword_opportunity_score(conn, ctx, {"keyword": "widgets"})["opportunity_score"] > 0
        assert kw_mod.list_keywords_near_page_one(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_keywords_high_impression_zero_click(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_keywords_by_competition_band(conn, ctx, {})["total"] >= 1
        assert kw_mod.get_keyword_serp_snapshot(conn, ctx, {"keyword": "widgets"})["keyword"] == "widgets"
        assert kw_mod.list_keywords_with_ai_overview(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_keywords_local_pack(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_keywords_question_intent(conn, ctx, {})["total"] >= 1
        assert kw_mod.list_keywords_commercial_intent(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_keywords", return_value=None):
        assert kw_mod.list_cannibalisation_queries(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_keywords", return_value={"rows": []}), patch(
        "website_profiling.tools.audit_tools.keyword_lists.read_keyword_snapshots_for_property",
        return_value=[{"rows": []}],
    ):
        assert kw_mod.list_keyword_rank_improvements(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_keywords", return_value=kw), patch(
        "website_profiling.integrations.google.keyword_store.read_keyword_snapshots_for_property",
        return_value=[prior],
    ):
        assert kw_mod.get_keyword_opportunity_score(conn, ctx, {"keyword": "missing"})["missing"] is True

    with patch.object(Ctx, "load_payload", return_value={}), patch.object(Ctx, "load_keywords", return_value={"semantic_keyword_clusters": []}):
        assert kw_mod.list_semantic_cluster_queries(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "x", "serp_estimated_competition": "bad"}]}):
        assert kw_mod.list_keywords_by_competition_band(conn, ctx, {})["total"] == 0


def test_backlink_lists_all_paths(conn: MagicMock, ctx: Ctx) -> None:
    no_prop = Ctx(property_id=None, report_id=1)
    assert bl_mod.list_referring_domains(conn, no_prop, {})["error"]
    assert bl_mod.list_backlinks_to_url(conn, ctx, {})["error"] == "url is required"
    assert bl_mod.list_backlinks_from_domain(conn, ctx, {})["error"] == "domain is required"

    links = _gsc_links()
    with patch.object(Ctx, "load_gsc_links", return_value=links):
        assert bl_mod.list_referring_domains(conn, ctx, {})["total"] >= 1
        assert bl_mod.list_backlinks_by_anchor_text(conn, ctx, {"anchor_text": "widget"})["total"] >= 1
        assert bl_mod.list_backlinks_to_url(conn, ctx, {"url": "https://ex.com/"})["total"] >= 1
        assert bl_mod.list_backlinks_from_domain(conn, ctx, {"domain": "partner.com"})["total"] >= 1
        assert bl_mod.get_anchor_text_distribution(conn, ctx, {})["source"] == "top_linking_text"

    derived = {
        "sample_links": [
            {"source_page": "https://www.example.com/x", "anchor_text": ""},
            {"source_page": "bad://", "anchor_text": "x"},
        ],
    }
    with patch.object(Ctx, "load_gsc_links", return_value=derived):
        assert bl_mod.list_referring_domains(conn, ctx, {})["total"] >= 1
        assert bl_mod.get_anchor_text_distribution(conn, ctx, {})["source"] == "sample_links"

    with patch.object(Ctx, "load_gsc_links", return_value=None):
        assert bl_mod.list_referring_domains(conn, ctx, {})["missing"] is True


def test_content_lists_all_paths(conn: MagicMock, ctx: Ctx) -> None:
    payload = _payload()
    df = _crawl_df()
    with patch.object(Ctx, "load_payload", return_value=None):
        assert content_mod.get_text_content_analysis(conn, ctx, {})["missing"] is True
        assert content_mod.list_pages_containing_keyword(conn, ctx, {"keyword": "x"})["error"]

    assert content_mod.list_pages_containing_keyword(conn, ctx, {})["error"] == "keyword is required"

    with patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert content_mod.get_text_content_analysis(conn, ctx, {})["missing"] is False
        assert content_mod.list_pages_containing_keyword(conn, ctx, {"keyword": "widgets"})["total"] >= 1
        assert content_mod.list_pages_by_word_count_band(conn, ctx, {"min_word_count": "bad"})["band"]["min_word_count"] == 0
        assert content_mod.list_duplicate_content_pairs(conn, ctx, {})["total"] >= 1
        assert content_mod.list_spell_check_issues(conn, ctx, {})["total"] >= 1
        assert content_mod.list_html_validation_issues(conn, ctx, {})["total"] >= 1
        assert content_mod.list_amp_validation_issues(conn, ctx, {})["total"] >= 1
        assert content_mod.list_pagination_issues(conn, ctx, {})["total"] >= 1
        assert content_mod.list_schema_errors_by_type(conn, ctx, {"schema_type": "faq"})["total"] >= 1
        assert content_mod.list_pages_missing_article_schema(conn, ctx, {})["total"] >= 1

    fallback_payload = {"content_analytics": {"keyword_index": [{"word": "repair", "top_pages": []}]}}
    with patch.object(Ctx, "load_payload", return_value=fallback_payload):
        assert content_mod.get_text_content_analysis(conn, ctx, {})["note"]

    cat_payload = {
        "optional_audit_urls": {},
        "categories": [{"issues": [{"message": "custom audit needle found on page"}]}],
    }
    with patch.object(Ctx, "load_payload", return_value=cat_payload):
        assert content_mod.list_spell_check_issues(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_payload", return_value={"categories": []}), patch.object(Ctx, "load_crawl_df", return_value=df):
        assert content_mod.list_pages_containing_keyword(conn, ctx, {"keyword": "widgets"})["total"] >= 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert content_mod.list_pages_by_word_count_band(conn, ctx, {})["missing"] is True
        assert content_mod.list_pages_missing_article_schema(conn, ctx, {})["missing"] is True


def test_link_lists_all_paths(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_payload", return_value=None):
        assert link_mod.list_outbound_links(conn, ctx, {})["error"]
        assert link_mod.list_internal_links_from_url(conn, ctx, {"url": "https://ex.com/"})["error"]
        assert link_mod.list_internal_links_to_url(conn, ctx, {"url": "https://ex.com/"})["error"]
        assert link_mod.list_links_by_rel_nofollow(conn, ctx, {})["error"]
        assert link_mod.list_pagerank_low_pages(conn, ctx, {})["error"]

    assert link_mod.list_internal_links_from_url(conn, ctx, {})["error"] == "url is required"
    assert link_mod.list_internal_links_to_url(conn, ctx, {})["error"] == "url is required"

    payload = _payload()
    with patch.object(Ctx, "load_payload", return_value=payload):
        assert link_mod.list_outbound_links(conn, ctx, {})["total"] >= 1
        assert link_mod.list_internal_links_from_url(conn, ctx, {"url": "https://ex.com/"})["total"] >= 1
        assert link_mod.list_internal_links_to_url(conn, ctx, {"url": "https://ex.com/"})["total"] >= 1
        assert link_mod.list_links_by_rel_nofollow(conn, ctx, {})["total"] >= 1
        assert link_mod.list_links_by_rel_nofollow(conn, ctx, {"rel": "ugc"})["total"] >= 1
        assert link_mod.list_pagerank_low_pages(conn, ctx, {"max_pagerank": "bad"})["total"] >= 1

    graph_payload = {
        "start_url": "https://ex.com/",
        "graph_edges": [[0, 1], {"from": "https://ex.com/a", "to": "https://other.com/x"}],
        "top_pages": [{"url": "https://ex.com/x", "pagerank": "bad"}, {"url": "https://ex.com/y", "pagerank": 0.001}],
    }
    with patch.object(Ctx, "load_payload", return_value=graph_payload):
        assert link_mod.list_outbound_links(conn, ctx, {})["total"] >= 1
        assert link_mod.list_pagerank_low_pages(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_payload", return_value={"top_pages": []}):
        assert link_mod.list_pagerank_low_pages(conn, ctx, {})["missing"] is True


def test_indexation_lists_all_paths(conn: MagicMock, ctx: Ctx) -> None:
    payload = _payload()
    df = _crawl_df()
    with patch.object(Ctx, "load_payload", return_value=None):
        assert idx_mod.list_indexation_submitted_not_indexed(conn, ctx, {})["error"]
        assert idx_mod.list_log_orphan_high_traffic(conn, ctx, {})["error"]

    with patch.object(Ctx, "load_payload", return_value={"indexation_coverage": "bad"}):
        assert idx_mod.list_sitemap_urls_not_in_crawl(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_payload", return_value=payload):
        assert idx_mod.list_indexation_submitted_not_indexed(conn, ctx, {})["total"] >= 1
        assert idx_mod.list_indexation_indexed_not_submitted(conn, ctx, {})["total"] >= 1
        assert idx_mod.list_sitemap_urls_not_in_crawl(conn, ctx, {})["source"]
        assert idx_mod.list_crawl_urls_not_in_sitemap(conn, ctx, {})["source"]

    no_prop = Ctx(property_id=None, report_id=1)
    assert idx_mod.list_log_paths_by_hits(conn, no_prop, {})["error"]

    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=None):
        assert idx_mod.list_log_paths_by_hits(conn, ctx, {})["missing"] is True

    log = _log_row()
    orphan_payload = {**payload, "orphan_urls": ["https://ex.com/orphan"]}
    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=log), patch.object(
        Ctx, "load_payload", return_value=orphan_payload,
    ):
        assert idx_mod.list_log_paths_by_hits(conn, ctx, {})["total"] >= 1
        assert idx_mod.list_log_5xx_paths(conn, ctx, {})["total"] >= 1
        assert idx_mod.list_log_googlebot_low_crawl(conn, ctx, {"min_hits": "bad"})["total"] >= 0
        assert idx_mod.list_log_orphan_high_traffic(conn, ctx, {"min_hits": "bad"})["total"] >= 0

    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=log), patch.object(
        Ctx, "load_payload", return_value={"orphan_urls": []},
    ):
        assert idx_mod.list_log_orphan_high_traffic(conn, ctx, {})["note"]

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        assert idx_mod.list_redirect_chains_by_length(conn, ctx, {"min_length": "bad"})["total"] >= 1
        assert idx_mod.list_hreflang_reciprocal_gaps(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert idx_mod.list_hreflang_reciprocal_gaps(conn, ctx, {})["missing"] is True


def test_compare_list_tools_all_paths(conn: MagicMock, ctx: Ctx) -> None:
    err = {"error": "baseline required"}
    with patch("website_profiling.tools.audit_tools.compare_list_tools.load_compare_pair", return_value=(None, None, None, None, err)):
        assert cmp_mod.list_compare_new_issues(conn, ctx, {})["error"]
        assert cmp_mod.list_compare_resolved_issues(conn, ctx, {})["error"]
        assert cmp_mod.list_compare_new_urls(conn, ctx, {})["error"]
        assert cmp_mod.list_compare_removed_urls(conn, ctx, {})["error"]
        assert cmp_mod.list_compare_lighthouse_regressions(conn, ctx, {})["error"]
        assert cmp_mod.list_compare_traffic_losers(conn, ctx, {})["error"]

    current, baseline = _compare_current(), _compare_baseline()
    with patch("website_profiling.tools.audit_tools.compare_list_tools.load_compare_pair", return_value=(current, baseline, 2, 1, None)):
        assert cmp_mod.list_compare_new_issues(conn, ctx, {})["total"] >= 0
        assert cmp_mod.list_compare_resolved_issues(conn, ctx, {})["total"] >= 0
        assert cmp_mod.list_compare_new_urls(conn, ctx, {})["total"] >= 1
        assert cmp_mod.list_compare_removed_urls(conn, ctx, {})["total"] >= 1
        assert cmp_mod.list_compare_lighthouse_regressions(conn, ctx, {"min_regression": "bad"})["total"] >= 1
        assert cmp_mod.list_compare_traffic_losers(conn, ctx, {})["total"] >= 1

    no_google = dict(current)
    no_google.pop("google")
    base_no_google = dict(baseline)
    base_no_google.pop("google")
    with patch("website_profiling.tools.audit_tools.compare_list_tools.load_compare_pair", return_value=(no_google, base_no_google, 2, 1, None)), patch.object(
        Ctx, "load_google_full", return_value=None,
    ), patch.object(Ctx, "load_google", return_value=None):
        assert cmp_mod.list_compare_traffic_losers(conn, ctx, {})["missing"] is True


def test_geo_list_tools_all_paths(conn: MagicMock, ctx: Ctx) -> None:
    df = _crawl_df()
    payload = _payload()
    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert geo_list_mod.list_pages_missing_howto_schema(conn, ctx, {})["missing"] is True
        assert geo_list_mod.list_pages_ai_citation_signals(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        assert geo_list_mod.list_pages_missing_howto_schema(conn, ctx, {})["total"] >= 1
        assert geo_list_mod.list_pages_ai_citation_signals(conn, ctx, {"min_score": "bad"})["total"] >= 1

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch(
        "website_profiling.tools.audit_tools.geo_list_tools._fetch_llms_txt",
        return_value={"found": False},
    ):
        assert geo_list_mod.list_pages_missing_llms_txt_reference(conn, ctx, {})["missing"] is True

    llms = {"found": True, "url": "https://ex.com/llms.txt", "preview": "https://ex.com/\nMore docs"}
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch(
        "website_profiling.tools.audit_tools.geo_list_tools._fetch_llms_txt", return_value=llms,
    ), patch.object(Ctx, "load_payload", return_value=payload), patch.object(Ctx, "load_crawl_df", return_value=df):
        missing = geo_list_mod.list_pages_missing_llms_txt_reference(conn, ctx, {})
        assert missing["total"] >= 1

    with patch.object(Ctx, "resolve_property_domain", return_value=""):
        assert geo_list_mod.list_robots_blocked_ai_crawlers(conn, ctx, {})["error"]

    robots = "User-agent: GPTBot\nDisallow: /\nUser-agent: *\nDisallow: /private"
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch.object(
        geo_list_mod, "_parse_robots_txt", return_value=robots,
    ):
        blocked = geo_list_mod.list_robots_blocked_ai_crawlers(conn, ctx, {})
        assert blocked["total"] >= 1

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), patch.object(
        geo_list_mod, "_parse_robots_txt", return_value="",
    ):
        assert geo_list_mod.list_robots_blocked_ai_crawlers(conn, ctx, {})["missing"] is True

    with patch("website_profiling.tools.audit_tools.geo_list_tools.requests.get", side_effect=requests.RequestException("fail")):
        assert geo_list_mod._parse_robots_txt("ex.com") == ""

    mock_resp = MagicMock(status_code=404, text="")
    with patch("website_profiling.tools.audit_tools.geo_list_tools.requests.get", return_value=mock_resp):
        assert geo_list_mod._parse_robots_txt("ex.com") == ""


def test_crawl_console_and_js_handlers(conn: MagicMock, ctx: Ctx) -> None:
    assert crawl_mod.list_pages_console_errors_by_type(conn, ctx, {})["error"] == "error_type is required"

    df = _crawl_df()
    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert crawl_mod.list_pages_console_errors_by_type(conn, ctx, {"error_type": "error"})["total"] == 0
        assert crawl_mod.list_pages_js_rendering_delta(conn, ctx, {})["note"]

    with patch.object(Ctx, "load_crawl_df", return_value=df):
        console = crawl_mod.list_pages_console_errors_by_type(conn, ctx, {"error_type": "error"})
        assert console["total"] >= 1
        page_err = crawl_mod.list_pages_console_errors_by_type(conn, ctx, {"error_type": "page_error"})
        assert page_err["total"] >= 1
        js = crawl_mod.list_pages_js_rendering_delta(conn, ctx, {})
        assert js["total"] >= 1
        assert js["provenance"] == "Crawl"

    js_only = pd.DataFrame([
        {"url": "https://ex.com/js", "status": "200", "fetch_method": "static", "title": "A", "word_count": 10, "h1": "A"},
        {"url": "https://ex.com/js", "status": "200", "fetch_method": "javascript", "title": "B", "word_count": 100, "h1": "B"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=js_only):
        assert crawl_mod.list_pages_js_rendering_delta(conn, ctx, {})["total"] == 1


def test_batch100_coverage_gaps(conn: MagicMock, ctx: Ctx) -> None:
    """Hit remaining branches for 100% line coverage on batch-100 modules."""
    empty = pd.DataFrame()
    df = _crawl_df()

    # issue_lists helpers and dead paths
    with patch.object(Ctx, "load_payload", return_value=None):
        assert issue_mod._payload_list_key(conn, ctx, {}, "missing_key")["error"]
    with patch.object(Ctx, "load_payload", return_value={"flat_list": [{"url": "x"}]}):
        assert issue_mod._payload_list_key(conn, ctx, {}, "flat_list")["total"] == 1
    with patch.object(Ctx, "load_payload", return_value={"scalar_key": 123}):
        assert issue_mod._payload_list_key(conn, ctx, {}, "scalar_key")["missing"] is True
    with patch.object(Ctx, "load_payload", return_value={"issues": {"seo": [{"type": "missing_title", "url": "u"}]}}):
        assert issue_mod._issues_by_type(conn, ctx, {}, "missing_title")["total"] == 1
    with patch.object(Ctx, "load_payload", return_value={"issues": "bad"}):
        assert issue_mod._issues_by_type(conn, ctx, {}, "x")["total"] == 0

    crawl_only = pd.DataFrame([
        {"url": "https://ex.com/long", "status": "200", "title_length": 65, "title": "T" * 65},
        {"url": "https://ex.com/slow2", "status": "200", "response_time_ms": 5000, "title": "Slow"},
        {"url": "https://ex.com/nolang2", "status": "200", "title": "X", "page_analysis": "{}"},
        {"url": "https://ex.com/vp", "status": "200", "viewport_present": "true", "viewport_content": "initial-scale=1", "page_analysis": "{}"},
        {"url": "https://ex.com/read", "status": "200", "reading_level": 14, "title": "Hard"},
    ])
    with patch.object(Ctx, "load_payload", return_value={"content_urls": {}}), patch.object(Ctx, "load_crawl_df", return_value=crawl_only):
        assert issue_mod.list_pages_title_too_long(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_slow_response(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_missing_html_lang(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_invalid_viewport(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_pages_high_reading_level(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_payload", return_value={"hreflang_issue_urls": []}), patch.object(Ctx, "load_crawl_df", return_value=empty):
        assert issue_mod.list_hreflang_issue_pages(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_payload", return_value=None), patch.object(Ctx, "load_crawl_df", return_value=empty):
        assert issue_mod.list_pages_missing_og_tags(conn, ctx, {})["error"]
        assert issue_mod.list_pages_missing_twitter_cards(conn, ctx, {})["error"]

    no_dom = {"language_summary": {"counts": {}}}
    with patch.object(Ctx, "load_payload", return_value=no_dom), patch.object(Ctx, "load_crawl_df", return_value=df):
        mixed = issue_mod.list_pages_mixed_language(conn, ctx, {})
        assert mixed["total"] == 0

    lh_edge = {
        "lighthouse_failure_urls": {},
        "lighthouse_by_url": {
            "https://ex.com/lcp2": {"lcp": 4.0, "cwv_failures": "lcp"},
            "https://ex.com/inp2": {"inp": 500, "top_failures": [{"id": "inp-slow"}]},
            "https://ex.com/cls2": {"cls": 0.25, "cwv_failures": "cls"},
            "https://ex.com/audit": {"lcp": 1.0, "audits": {"lcp": {"score": 0.5, "title": "LCP audit"}}},
            "bad": "skip",
        },
    }
    with patch.object(Ctx, "load_payload", return_value=lh_edge):
        assert issue_mod.list_lighthouse_failure_lcp(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_lighthouse_failure_inp(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_lighthouse_failure_cls(conn, ctx, {})["total"] >= 1
        assert issue_mod.list_lighthouse_failure_seo(conn, ctx, {})["total"] == 0
    with patch.object(Ctx, "load_payload", return_value={"lighthouse_by_url": {"https://ex.com/badseo": {"seo": "bad"}}}):
        assert issue_mod.list_lighthouse_failure_seo(conn, ctx, {})["total"] == 0

    # google_lists gaps
    no_google = None
    google_handlers = [
        google_mod.list_gsc_pages_by_impressions,
        google_mod.list_gsc_pages_by_clicks,
        google_mod.list_gsc_queries_by_impressions,
        google_mod.list_gsc_queries_by_clicks,
        google_mod.list_gsc_ctr_underperformers,
        google_mod.list_ga4_landing_pages,
        google_mod.list_ga4_pages_by_bounce_rate,
        google_mod.list_ga4_pages_by_engagement_rate,
        google_mod.list_gsc_ga4_mismatch_pages,
        google_mod.list_gsc_pages_by_position_band,
        google_mod.get_gsc_site_benchmarks,
    ]
    with patch.object(Ctx, "load_google_full", return_value=no_google), patch.object(Ctx, "load_google", return_value=no_google):
        for handler in google_handlers:
            assert handler(conn, ctx, {}).get("missing") is True

    assert google_mod._gsc_rows(None, "pages") == []
    assert google_mod._gsc_rows({"gsc_full": {"pages": "bad"}}, "pages") == []

    decay_curr = {"gsc_full": {"pages": [{"page": "https://ex.com/p", "clicks": 5, "impressions": 100, "position": 8}]}}
    decay_prior = {"gsc_full": {"pages": [{"page": "https://ex.com/p", "clicks": 20, "impressions": 200, "position": 5}]}}
    assert google_mod._gsc_deltas(
        google_mod._gsc_rows(decay_curr, "pages"),
        google_mod._gsc_rows(decay_prior, "pages"),
        ("page",),
        decay=True,
    )
    assert google_mod._gsc_deltas(
        google_mod._gsc_rows(decay_curr, "pages"),
        google_mod._gsc_rows(decay_prior, "pages"),
        ("page",),
        decay=False,
    ) == []

    with patch.object(google_mod, "_load_google_pair", return_value=(decay_curr, decay_prior)):
        assert google_mod.list_gsc_decaying_pages(conn, ctx, {})["total"] >= 1
        assert google_mod.list_gsc_decaying_queries(conn, ctx, {"limit": 5})["total"] == 0

    with patch.object(google_mod, "_load_google_pair", return_value=(None, decay_prior)):
        assert google_mod.list_gsc_decaying_queries(conn, ctx, {})["missing"] is True
        assert google_mod.list_gsc_new_queries(conn, ctx, {})["missing"] is True

    ga4_by_path = {"ga4_full": {"by_path": {"/only": {"sessions": 5, "bounceRate": 0.5, "engagementRate": 0.4}}}}
    with patch.object(Ctx, "load_google_full", return_value=ga4_by_path):
        assert google_mod.list_ga4_landing_pages(conn, ctx, {})["total"] == 1
        assert google_mod.list_ga4_pages_by_bounce_rate(conn, ctx, {})["total"] == 1
        assert google_mod.list_ga4_pages_by_engagement_rate(conn, ctx, {})["total"] == 1

    daily_dims = {
        "gsc": {"daily": [{"dimensions": {"page": "https://ex.com/dim"}, "clicks": 1}, "skip"]},
        "ga4": {"daily": "bad"},
    }
    with patch.object(Ctx, "load_google_full", return_value=daily_dims):
        assert google_mod._daily_series(daily_dims, "ga4", "path", "/") == []
        assert google_mod.get_gsc_page_trend(conn, ctx, {"url": "https://ex.com/dim"})["daily"]

    high_ctr_only = {"gsc_full": {"pages": [{"page": "https://ex.com/g", "clicks": 50, "impressions": 100, "ctr": "50%", "position": 3}]}}
    with patch.object(Ctx, "load_google_full", return_value=high_ctr_only):
        assert google_mod.list_gsc_ctr_underperformers(conn, ctx, {})["total"] == 0

    # keyword_lists gaps
    kw = _keyword_data()
    with patch.object(Ctx, "load_keywords", return_value=None), patch(
        "website_profiling.tools.audit_tools.keyword_lists.read_keyword_snapshots_for_property",
        return_value=[kw],
    ):
        cur, prior = kw_mod._load_keyword_pair(ctx, conn)
        assert cur is kw and prior is None

    entered_prior = {
        "rows": [{"keyword": "entered", "gsc_position": 15, "gsc_impressions": 10}],
    }
    entered_curr = {
        "rows": [{"keyword": "entered", "gsc_position": 8, "gsc_impressions": 20}],
    }
    assert kw_mod._top_ten_transitions(entered_curr, entered_prior, entered=True)
    fell_curr = {"rows": [{"keyword": "fell", "gsc_position": 15, "gsc_impressions": 5}]}
    fell_prior = {"rows": [{"keyword": "fell", "gsc_position": 5, "gsc_impressions": 50}]}
    assert kw_mod._top_ten_transitions(fell_curr, fell_prior, entered=False)

    no_prop = Ctx(property_id=None, report_id=1)
    assert kw_mod.list_cannibalisation_urls(conn, no_prop, {})["missing"] is True
    assert kw_mod.list_misaligned_queries(conn, no_prop, {})["missing"] is True
    assert kw_mod.list_semantic_cluster_pages(conn, no_prop, {})["missing"] is True
    assert kw_mod.get_keyword_opportunity_score(conn, no_prop, {"keyword": "x"})["missing"] is True
    assert kw_mod.get_keyword_serp_snapshot(conn, no_prop, {"keyword": "x"})["missing"] is True

    with patch.object(Ctx, "load_keywords", return_value=kw), patch.object(Ctx, "load_payload", return_value={}):
        assert kw_mod._keyword_bucket(conn, ctx, {}, key="semantic_keyword_clusters", item_key="clusters")["total"] >= 1

    with patch.object(Ctx, "load_keywords", return_value=None):
        assert kw_mod._filter_keywords(conn, ctx, {}, lambda r: True)["missing"] is True
        assert kw_mod._pair_delta_tool(conn, ctx, {}, builder=lambda a, b: [], item_key="keywords")["missing"] is True

    with patch.object(Ctx, "load_keywords", return_value={"rows": []}), patch(
        "website_profiling.tools.audit_tools.keyword_lists.read_keyword_snapshots_for_property",
        return_value=[],
    ):
        assert kw_mod._load_keyword_pair(ctx, conn) == ({"rows": []}, None)

    with patch.object(Ctx, "load_keywords", return_value=kw), patch.object(Ctx, "load_payload", return_value={}):
        assert kw_mod._semantic_clusters(ctx, conn)

    assert kw_mod._keyword_rows(None) == []
    assert kw_mod._position({"gsc_position": 0}) is None
    assert kw_mod._position({"gsc_position": "bad"}) is None

    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "x"}]}):
        assert kw_mod.list_keywords_by_competition_band(conn, ctx, {"min_competition": "bad"})["error"]

    # backlink_lists error branches
    no_prop = Ctx(property_id=None, report_id=1)
    for handler, args in [
        (bl_mod.list_backlinks_by_anchor_text, {}),
        (bl_mod.list_backlinks_to_url, {"url": "https://ex.com"}),
        (bl_mod.list_backlinks_from_domain, {"domain": "x.com"}),
    ]:
        assert handler(conn, no_prop, args)["error"]
    with patch.object(Ctx, "load_gsc_links", return_value=None):
        assert bl_mod.list_backlinks_by_anchor_text(conn, ctx, {})["missing"] is True
        assert bl_mod.list_backlinks_to_url(conn, ctx, {"url": "https://ex.com"})["missing"] is True
        assert bl_mod.list_backlinks_from_domain(conn, ctx, {"domain": "x.com"})["missing"] is True
        assert bl_mod.get_anchor_text_distribution(conn, ctx, {})["missing"] is True
    with patch("website_profiling.tools.audit_tools.backlink_lists.urlparse", side_effect=ValueError("bad")):
        assert bl_mod._norm_domain("bad://") == "bad://"

    # content_lists gaps
    with patch.object(Ctx, "load_payload", return_value=None):
        assert content_mod.list_duplicate_content_pairs(conn, ctx, {})["error"]
        assert content_mod.list_schema_errors_by_type(conn, ctx, {})["error"]

    cat_issues = {
        "optional_audit_urls": {},
        "categories": [
            {
                "issues": [
                    {"message": "spell issue on page"},
                    {"message": "html markup broken"},
                    {"message": "amp validation failed"},
                    {"message": "pagination rel=next broken"},
                    {"message": "needle custom audit"},
                ],
            },
        ],
    }
    with patch.object(Ctx, "load_payload", return_value=cat_issues):
        assert content_mod.list_spell_check_issues(conn, ctx, {})["total"] >= 1
        assert content_mod.list_html_validation_issues(conn, ctx, {})["total"] >= 1
        assert content_mod.list_amp_validation_issues(conn, ctx, {})["total"] >= 1
        assert content_mod.list_pagination_issues(conn, ctx, {})["total"] >= 1

    dup_bad = {"content_duplicates": ["skip", {"member_urls": "bad", "representative_url": "https://ex.com/a"}]}
    with patch.object(Ctx, "load_payload", return_value=dup_bad):
        assert content_mod.list_duplicate_content_pairs(conn, ctx, {})["total"] == 0

    schema_payload = {"rich_results_validation": ["skip", {"status": "fail", "type": "Product"}]}
    with patch.object(Ctx, "load_payload", return_value=schema_payload):
        assert content_mod.list_schema_errors_by_type(conn, ctx, {})["total"] == 1
        assert content_mod.list_schema_errors_by_type(conn, ctx, {"schema_type": "product"})["total"] == 1

    article_df = pd.DataFrame([
        {
            "url": "https://ex.com/blog/my-post",
            "status": "200",
            "title": "Post",
            "content_excerpt": "Posted by author on Monday. " + ("word " * 210),
            "page_analysis": json.dumps({"json_ld_types": ["WebPage"]}),
        },
        {
            "url": "https://ex.com/with-schema",
            "status": "200",
            "title": "Article",
            "content_excerpt": "short",
            "page_analysis": json.dumps({"json_ld_types": ["NewsArticle"]}),
        },
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=article_df):
        assert content_mod.list_pages_missing_article_schema(conn, ctx, {})["total"] >= 1

    kw_payload = {
        "text_content_analysis": {
            "keyword_index": [{"word": "term", "top_pages": ["skip", ("https://ex.com/t", 1)]}],
        },
    }
    with patch.object(Ctx, "load_payload", return_value=kw_payload), patch.object(Ctx, "load_crawl_df", return_value=empty):
        assert content_mod.list_pages_containing_keyword(conn, ctx, {"keyword": "term"})["total"] == 1

    # link_lists gaps
    graph_only = {"graph_edges": ["skip", [1, 2]], "top_pages": ["skip", {"url": "https://ex.com/z", "pagerank": None}]}
    with patch.object(Ctx, "load_payload", return_value=graph_only):
        assert link_mod._load_link_edges(graph_only)
        assert link_mod._pagerank_rows(graph_only) == []

    # indexation_lists gaps
    assert idx_mod._cap_indexation_urls("bad", {})["total"] == 0
    with patch.object(Ctx, "load_payload", return_value=_payload()):
        cov_err = idx_mod.list_indexation_indexed_not_submitted(conn, ctx, {})
        assert cov_err["total"] >= 1

    log_non_list = {
        "analysis": {
            "top_paths": "bad",
            "paths_5xx": "bad",
            "googlebot_paths": ["skip"],
            "status_counts": {"500": 12, "503": 3},
        },
    }
    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=log_non_list), patch.object(
        Ctx, "load_payload", return_value=_payload(),
    ):
        assert idx_mod.list_log_paths_by_hits(conn, ctx, {})["total"] == 0
        assert idx_mod.list_log_5xx_paths(conn, ctx, {})["total"] >= 1
        assert idx_mod.list_log_googlebot_low_crawl(conn, ctx, {})["total"] >= 0

    orphan_log = {
        **_payload(),
        "orphan_urls": ["https://ex.com/orphan"],
        "links": [{"url": "https://ex.com/orphan"}],
    }
    log_row = {
        "analysis": {
            "top_paths": [{"path": "/orphan", "hits": 50}, {"path": "/other", "hits": 3}],
            "googlebot_paths": [{"path": "/orphan", "hits": 0}],
        },
    }
    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=log_row), patch.object(
        Ctx, "load_payload", return_value=orphan_log,
    ):
        assert idx_mod.list_log_orphan_high_traffic(conn, ctx, {})["total"] >= 1
        assert idx_mod.list_log_googlebot_low_crawl(conn, ctx, {"min_hits": 10, "max_googlebot_hits": 0})["total"] >= 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame([{"url": "https://ex.com/r", "status": "301", "redirect_chain_length": "bad"}])):
        assert idx_mod.list_redirect_chains_by_length(conn, ctx, {})["total"] == 0

    href_df = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "200", "page_analysis": json.dumps({
            "hreflang_alternates": [{"href": "https://ex.com/b", "hreflang": "en"}],
        })},
        {"url": "https://ex.com/b", "status": "200", "page_analysis": json.dumps({
            "hreflang_alternates": [{"href": "https://ex.com/c", "hreflang": "de"}],
        })},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=href_df):
        gaps = idx_mod.list_hreflang_reciprocal_gaps(conn, ctx, {})
        assert gaps["total"] >= 1

    with patch("website_profiling.tools.audit_tools.indexation_lists.url_to_path", side_effect=RuntimeError("bad")):
        assert idx_mod._norm_path("https://ex.com/x") == "https://ex.com/x"

    # compare_list_tools line 156 (skip non-losers)
    winner_current = {
        "report_generated_at": "2026-06-07",
        "google": {"gsc_full": {"pages": [{"page": "https://ex.com/win", "clicks": 100, "impressions": 200}]}},
    }
    winner_baseline = {
        "report_generated_at": "2026-05-01",
        "google": {"gsc_full": {"pages": [{"page": "https://ex.com/win", "clicks": 10, "impressions": 50}]}},
    }
    with patch("website_profiling.tools.audit_tools.compare_list_tools.load_compare_pair", return_value=(winner_current, winner_baseline, 2, 1, None)):
        losers = cmp_mod.list_compare_traffic_losers(conn, ctx, {})
        assert losers["total"] == 0

    # geo_list_tools gaps
    low_score_df = pd.DataFrame([{
        "url": "https://ex.com/low",
        "status": "200",
        "title": "Low",
        "content_excerpt": "tiny",
        "word_count": 10,
        "page_analysis": "{}",
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=low_score_df):
        assert geo_list_mod.list_pages_ai_citation_signals(conn, ctx, {"min_score": 50})["total"] == 0

    assert geo_list_mod._parse_robots_txt("") == ""
    ok_resp = MagicMock(status_code=200, text="User-agent: *\nAllow: /\n# comment\nUser-agent: ClaudeBot\nDisallow: /")
    with patch("website_profiling.tools.audit_tools.geo_list_tools.requests.get", return_value=ok_resp):
        robots = geo_list_mod._parse_robots_txt("ex.com")
        assert "User-agent" in robots
        assert geo_list_mod._agent_blocked(robots, "ClaudeBot") is True

    # --- final line coverage targets ---
    assert bl_mod._load_links(Ctx(property_id=None), conn) is None
    assert bl_mod.get_anchor_text_distribution(conn, Ctx(property_id=None), {})["error"]

    with patch.object(Ctx, "load_payload", return_value=None):
        assert content_mod.list_spell_check_issues(conn, ctx, {})["error"]

    optional_cat = {
        "categories": [
            "skip",
            {"issues": ["skip", {"message": "needle custom audit on page"}]},
        ],
    }
    with patch.object(Ctx, "load_payload", return_value=optional_cat):
        assert content_mod.list_pagination_issues(conn, ctx, {})["total"] >= 0

    with patch.object(Ctx, "load_payload", return_value={"content_duplicates": "bad"}):
        assert content_mod.list_duplicate_content_pairs(conn, ctx, {})["total"] == 0
    with patch.object(Ctx, "load_payload", return_value={"rich_results_validation": "bad"}):
        assert content_mod.list_schema_errors_by_type(conn, ctx, {})["total"] == 0

    article_types = pd.DataFrame([{
        "url": "https://ex.com/story-longform",
        "status": "200",
        "title": "Story",
        "content_excerpt": "Posted by author on Monday. " + ("word " * 210),
        "page_analysis": json.dumps({"json_ld_types": ["WebPage"]}),
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=article_types):
        content_mod.list_pages_missing_article_schema(conn, ctx, {})

    kw_skip = {
        "text_content_analysis": {
            "keyword_index": ["skip", {"word": "needle", "top_pages": [{"url": "https://ex.com/n", "count": 1}]}],
        },
    }
    with patch.object(Ctx, "load_payload", return_value=kw_skip), patch.object(Ctx, "load_crawl_df", return_value=empty):
        assert content_mod.list_pages_containing_keyword(conn, ctx, {"keyword": "needle"})["total"] == 1

    link_empty = {"link_edges": "bad", "links": ["skip", {"url": "https://ex.com/p", "pagerank": 0.5}]}
    with patch.object(Ctx, "load_payload", return_value=link_empty):
        assert link_mod._load_link_edges(link_empty) == []
        assert link_mod._pagerank_rows(link_empty)[0]["url"] == "https://ex.com/p"

    improving = {"gsc_full": {"pages": [{"page": "https://ex.com/up", "clicks": 30, "impressions": 300, "position": 3}]}}
    declining = {"gsc_full": {"pages": [{"page": "https://ex.com/up", "clicks": 10, "impressions": 100, "position": 5}]}}
    assert google_mod._gsc_deltas(
        google_mod._gsc_rows(improving, "pages"),
        google_mod._gsc_rows(declining, "pages"),
        ("page",),
        decay=True,
    ) == []

    with patch.object(google_mod, "_load_google_pair", return_value=(None, declining)):
        assert google_mod.list_gsc_decaying_pages(conn, ctx, {})["missing"] is True
        assert google_mod.list_gsc_new_queries(conn, ctx, {"limit": 1})["missing"] is True

    ga4_empty = {"ga4_full": {"top_pages": [], "by_path": {}}}
    with patch.object(Ctx, "load_google_full", return_value=ga4_empty):
        assert google_mod.list_ga4_landing_pages(conn, ctx, {})["total"] == 0

    mismatch_data = {
        "gsc_full": {
            "by_page": {"https://ex.com/ratio": {"clicks": 10, "impressions": 50}},
            "pages": [],
        },
        "ga4_full": {"by_path": {"/ratio": {"sessions": 40}}},
    }
    with patch.object(Ctx, "load_google_full", return_value=mismatch_data):
        assert google_mod.list_gsc_ga4_mismatch_pages(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_google_full", return_value={"gsc_full": {"pages": []}}):
        assert google_mod.get_gsc_page_trend(conn, ctx, {"url": "https://ex.com/missing"})["missing"] is True

    with patch.object(Ctx, "load_keywords", return_value=None):
        assert google_mod.list_gsc_branded_queries(conn, ctx, {})["missing"] is True
        assert google_mod.list_gsc_non_branded_queries(conn, ctx, {})["missing"] is True

    with patch.object(google_mod, "_load_google_pair", return_value=(_google_mismatch(), None)):
        assert google_mod.compare_gsc_periods(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_payload", return_value={"issues": {"seo": "not-list"}}):
        assert issue_mod._issues_by_type(conn, ctx, {}, "x")["total"] == 0

    bad_crawl = pd.DataFrame([
        {"url": "https://ex.com/badrt", "status": "200", "response_time_ms": "x", "title": "X"},
        {"url": "https://ex.com/badread", "status": "200", "reading_level": "x", "title": "X"},
    ])
    with patch.object(Ctx, "load_payload", return_value={"content_urls": {}}), patch.object(Ctx, "load_crawl_df", return_value=bad_crawl):
        assert issue_mod.list_pages_slow_response(conn, ctx, {})["total"] == 0
        assert issue_mod.list_pages_high_reading_level(conn, ctx, {})["total"] == 0

    lh_skip = {
        "lighthouse_by_url": {
            "https://ex.com/seo-fail2": {"seo": 40},
            "skip": "x",
        },
    }
    with patch.object(Ctx, "load_payload", return_value=lh_skip):
        assert issue_mod._lighthouse_failure_bucket(conn, ctx, {}, "seo")["total"] >= 1
        assert issue_mod._lighthouse_failure_bucket(conn, ctx, {}, "lcp")["total"] == 0

    with patch.object(Ctx, "load_payload", return_value={"indexation_coverage": {"lists": {}, "lists_total": {}}}):
        idx_mod.list_indexation_submitted_not_indexed(conn, ctx, {})
        idx_mod.list_crawl_urls_not_in_sitemap(conn, ctx, {})

    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=_log_row()), patch.object(
        Ctx, "load_payload", return_value=_payload(),
    ):
        assert idx_mod.list_log_googlebot_low_crawl(conn, ctx, {"min_hits": "bad"})["paths"] is not None

    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=_log_row()), patch.object(
        Ctx, "load_payload", return_value=None,
    ):
        assert idx_mod.list_log_orphan_high_traffic(conn, ctx, {})["error"]

    href_skip = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "200", "page_analysis": json.dumps({
            "hreflang_alternates": ["skip", {"href": "https://ex.com/b", "hreflang": "en"}],
        })},
        {"url": "https://ex.com/b", "status": "200", "page_analysis": "{}"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=href_skip):
        assert idx_mod.list_hreflang_reciprocal_gaps(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame([{"url": "https://ex.com/r2", "status": "301", "redirect_chain_length": 2}])):
        idx_mod.list_redirect_chains_by_length(conn, ctx, {"min_length": "bad"})

    skip_kw = {"rows": [{"keyword": "skip-top10", "gsc_position": 8}]}
    skip_prior = {"rows": [{"keyword": "skip-top10", "gsc_position": 5}]}
    assert kw_mod._top_ten_transitions(skip_kw, skip_prior, entered=True) == []
    skip_fell = {"rows": [{"keyword": "fell2", "gsc_position": 20}]}
    skip_fell_prior = {"rows": [{"keyword": "fell2", "gsc_position": 6}]}
    assert kw_mod._top_ten_transitions(skip_fell, skip_fell_prior, entered=False)

    assert kw_mod._rank_delta_rows(
        {"rows": [{"keyword": "x", "gsc_position": None}]},
        {"rows": [{"keyword": "x", "gsc_position": 8}]},
        improved=True,
    ) == []
    assert kw_mod._rank_delta_rows(
        {"rows": [{"keyword": "y", "gsc_position": 10}]},
        {"rows": [{"keyword": "y", "gsc_position": 8}]},
        improved=True,
    ) == []

    with patch.object(Ctx, "load_keywords", return_value=None), patch.object(Ctx, "load_payload", return_value={"semantic_keyword_clusters": [{"keywords": ["a"]}]}):
        assert kw_mod._semantic_clusters(ctx, conn)

    with patch.object(Ctx, "load_payload", return_value={"semantic_keyword_clusters": []}), patch.object(Ctx, "load_keywords", return_value=None):
        assert kw_mod.list_semantic_cluster_pages(conn, ctx, {})["missing"] is True

    with patch.object(Ctx, "load_keywords", return_value={"rows": [{"keyword": "widgets", "gsc_position": 5}]}):
        assert kw_mod.get_keyword_opportunity_score(conn, ctx, {"keyword": "widgets"})["opportunity_score"] >= 0
        assert kw_mod.get_keyword_serp_snapshot(conn, ctx, {"keyword": "missing-kw"})["missing"] is True

    # --- remaining uncovered line targets ---
    with patch.object(Ctx, "load_payload", return_value=None):
        assert issue_mod._issues_by_type(conn, ctx, {}, "missing_title")["error"]

    with patch.object(Ctx, "load_payload", return_value=None):
        assert issue_mod._lighthouse_failure_bucket(conn, ctx, {}, "lcp")["error"]

    lh_bad_cwv = {
        "lighthouse_by_url": {
            "https://ex.com/bad-cwv": {"lcp": "n/a", "cwv_failures": "lcp", "top_failures": []},
            "https://ex.com/bad-seo": {"seo": "bad"},
        },
    }
    with patch.object(Ctx, "load_payload", return_value=lh_bad_cwv):
        issue_mod._lighthouse_failure_bucket(conn, ctx, {}, "lcp")
        issue_mod._lighthouse_failure_bucket(conn, ctx, {}, "seo")

    under_ctr = {
        "gsc_full": {
            "pages": [
                {"page": "https://ex.com/high", "clicks": 50, "impressions": 500, "ctr": 0.08, "position": 3},
                {"page": "https://ex.com/low-ctr", "clicks": 1, "impressions": 500, "ctr": 0.01, "position": 5},
            ],
        },
    }
    with patch.object(Ctx, "load_google_full", return_value=under_ctr):
        assert google_mod.list_gsc_ctr_underperformers(conn, ctx, {})["total"] >= 1

    decay_curr = {"gsc_full": {"queries": [{"query": "decay-q", "clicks": 1, "impressions": 50, "position": 12}]}}
    decay_prior = {"gsc_full": {"queries": [{"query": "decay-q", "clicks": 10, "impressions": 200, "position": 5}]}}
    with patch.object(google_mod, "_load_google_pair", return_value=(decay_curr, None)):
        assert google_mod.list_gsc_decaying_queries(conn, ctx, {})["missing"] is True
        assert google_mod.list_gsc_new_queries(conn, ctx, {})["missing"] is True
    with patch.object(google_mod, "_load_google_pair", return_value=(None, decay_prior)):
        assert google_mod.compare_gsc_periods(conn, ctx, {})["missing"] is True

    ga4_bad_pages = {"ga4_full": {"top_pages": "bad", "by_path": {"/x": {"sessions": 1}}}}
    with patch.object(Ctx, "load_google_full", return_value=ga4_bad_pages):
        assert google_mod.list_ga4_landing_pages(conn, ctx, {})["total"] == 0

    assert google_mod._daily_series(None, "gsc", "page", "/") == []

    with patch.object(Ctx, "load_google_full", return_value={"gsc_full": {"queries": [{"query": "snap-q", "clicks": 2}]}}):
        snap = google_mod.get_gsc_query_trend(conn, ctx, {"query": "snap-q"})
        assert snap.get("missing") is True and snap.get("snapshot")
        fallback = google_mod.get_gsc_query_trend(conn, ctx, {"query": "not-in-gsc"})
        assert fallback.get("daily") == []

    with patch.object(Ctx, "load_google_full", return_value=_google_mismatch()):
        assert google_mod.list_gsc_pages_by_position_band(conn, ctx, {"max_position": object()})["total"] >= 0

    mismatch_pages_only = {
        "gsc_full": {
            "pages": [{"page": "https://ex.com/p-only", "clicks": 15, "impressions": 80, "position": 4}],
        },
        "ga4_full": {"by_path": {"/p-only": {"sessions": 0}}},
    }
    with patch.object(Ctx, "load_google_full", return_value=mismatch_pages_only):
        assert google_mod.list_gsc_ga4_mismatch_pages(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_google_full", return_value=_google_mismatch()):
        assert google_mod.list_gsc_pages_by_position_band(conn, ctx, {"min_position": object()})["total"] >= 0

    fell_still_top = {"rows": [{"keyword": "still-top", "gsc_position": 8}]}
    fell_still_prior = {"rows": [{"keyword": "still-top", "gsc_position": 6}]}
    assert kw_mod._top_ten_transitions(fell_still_top, fell_still_prior, entered=False) == []

    assert kw_mod.list_keywords_near_page_one(conn, Ctx(property_id=None, report_id=1), {})["missing"] is True

    cann_empty_url = {
        "cannibalisation": [{"query": "q", "pages": [{"url": "", "position": 1}, {"url": "https://ex.com/c", "position": 2}]}],
    }
    with patch.object(Ctx, "load_keywords", return_value=cann_empty_url):
        assert kw_mod.list_cannibalisation_urls(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_keywords", return_value=None):
        assert kw_mod.list_cannibalisation_urls(conn, ctx, {})["missing"] is True
        assert kw_mod.get_keyword_opportunity_score(conn, ctx, {"keyword": "x"})["missing"] is True
        assert kw_mod.get_keyword_serp_snapshot(conn, ctx, {"keyword": "x"})["missing"] is True

    custom_audit = {
        "optional_audit_urls": {},
        "categories": [{"issues": [{"message": "custom foo audit detected on page"}]}],
    }
    with patch.object(Ctx, "load_payload", return_value=custom_audit):
        assert content_mod._optional_audit_urls(conn, ctx, {}, "foo")["total"] >= 1

    kw_index = {
        "text_content_analysis": {
            "keyword_index": [
                {"word": "unrelated", "top_pages": [{"url": "https://ex.com/x", "count": 1}]},
                {"word": "needleword", "top_pages": [{"url": "https://ex.com/y", "count": 2}]},
            ],
        },
    }
    with patch.object(Ctx, "load_payload", return_value=kw_index), patch.object(Ctx, "load_crawl_df", return_value=empty):
        assert content_mod.list_pages_containing_keyword(conn, ctx, {"keyword": "needle"})["total"] == 1

    article_str_types = pd.DataFrame([{
        "url": "https://ex.com/blog/posted-by-author",
        "status": "200",
        "title": "Story",
        "content_excerpt": "Posted by author on Monday. " + ("word " * 210),
        "page_analysis": json.dumps({"json_ld_types": "WebPage"}),
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=article_str_types):
        content_mod.list_pages_missing_article_schema(conn, ctx, {})

    no_cov_payload = {k: v for k, v in _payload().items() if k != "indexation_coverage"}
    with patch.object(Ctx, "load_payload", return_value=no_cov_payload):
        assert idx_mod.list_indexation_indexed_not_submitted(conn, ctx, {})["error"]
        assert idx_mod.list_crawl_urls_not_in_sitemap(conn, ctx, {})["error"]

    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=_log_row()):
        assert idx_mod.list_log_5xx_paths(conn, Ctx(property_id=None, report_id=1), {})["error"]
        assert idx_mod.list_log_googlebot_low_crawl(conn, Ctx(property_id=None, report_id=1), {})["error"]

    bot_log = {
        "analysis": {
            "top_paths": ["skip", {"path": "/popular", "hits": 100}, {"path": "/crawled", "hits": 50}],
            "googlebot_paths": [{"path": "/popular", "hits": 2}, {"path": "/crawled", "hits": 1}],
        },
    }
    bot_payload = {
        **_payload(),
        "links": [{"url": "https://ex.com/crawled"}, {"url": "https://ex.com/popular"}],
    }
    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=bot_log), patch.object(
        Ctx, "load_payload", return_value=bot_payload,
    ):
        assert idx_mod.list_log_googlebot_low_crawl(conn, ctx, {"min_hits": 20, "max_googlebot_hits": 5})["total"] == 0

    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=_log_row()):
        assert idx_mod.list_log_orphan_high_traffic(conn, Ctx(property_id=None, report_id=1), {})["error"]

    orphan_payload = {
        **_payload(),
        "orphan_urls": ["", "https://ex.com/orphan"],
    }
    orphan_log2 = {
        "analysis": {
            "top_paths": ["skip", {"path": "/orphan", "hits": 50}],
        },
    }
    with patch("website_profiling.tools.audit_tools.indexation_lists._load_log_analysis", return_value=orphan_log2), patch.object(
        Ctx, "load_payload", return_value=orphan_payload,
    ):
        assert idx_mod.list_log_orphan_high_traffic(conn, ctx, {})["total"] >= 1

    with patch.object(Ctx, "load_crawl_df", return_value=pd.DataFrame()):
        assert idx_mod.list_redirect_chains_by_length(conn, ctx, {})["pages"] == []

    href_empty_url = pd.DataFrame([
        {"url": "", "status": "200", "page_analysis": "{}"},
        {"url": "https://ex.com/a", "status": "200", "page_analysis": json.dumps({
            "hreflang_alternates": [{"href": "https://ex.com/b", "hreflang": "en"}],
        })},
        {"url": "https://ex.com/b", "status": "200", "page_analysis": "{}"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=href_empty_url):
        idx_mod.list_hreflang_reciprocal_gaps(conn, ctx, {})

    bad_graph = {"link_edges": [], "graph_edges": "bad", "top_pages": "bad", "links": [{"url": "https://ex.com/p", "pagerank": 0.3}]}
    with patch.object(Ctx, "load_payload", return_value=bad_graph):
        assert link_mod._load_link_edges(bad_graph) == []
        assert link_mod._pagerank_rows(bad_graph) == []

