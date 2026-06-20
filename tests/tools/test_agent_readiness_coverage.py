"""Tools coverage tests for agent_readiness.py (100% gate)."""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from website_profiling.tools.audit_tools import agent_readiness as ar_mod
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.audit_tools._aeo_helpers import (
    count_tokens,
    detect_copy_for_ai,
    score_content_structure_aeo,
)


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


@pytest.fixture
def ctx() -> Ctx:
    return Ctx(property_id=1, report_id=1)


# ---------------------------------------------------------------------------
# _aeo_helpers coverage gaps
# ---------------------------------------------------------------------------

def test_count_tokens_empty_string() -> None:
    """count_tokens('') returns 0 — covers the early return on line 61."""
    assert count_tokens("") == 0


def test_count_tokens_cached_encoder() -> None:
    """Call count_tokens twice to exercise the cached _ENC path."""
    t1 = count_tokens("hello world")
    t2 = count_tokens("foo bar baz")
    assert t1 >= 1
    assert t2 >= 1


def test_count_tokens_fallback_on_error() -> None:
    """Exercise the except fallback when encoder raises."""
    with patch("website_profiling.tools.audit_tools._aeo_helpers._get_encoder",
               side_effect=RuntimeError("enc fail")):
        result = count_tokens("twelve characters")
    assert result >= 0


def test_detect_copy_for_ai_empty_string() -> None:
    """detect_copy_for_ai('') returns False — covers the empty-html guard (line 137)."""
    assert detect_copy_for_ai("") is False


def test_detect_copy_for_ai_data_attr() -> None:
    html = '<button data-copy="page">📋</button>'
    assert detect_copy_for_ai(html) is True


def test_detect_copy_for_ai_aria_only() -> None:
    """HTML with only an aria-label match (no text or data-attr match) — covers line 143."""
    # Deliberately avoid text patterns like "Copy for AI" or "Copy as Markdown"
    html = '<button aria-label="open clipboard manager">📋</button>'
    assert detect_copy_for_ai(html) is True


def test_score_content_structure_density_bonuses() -> None:
    """Exercise h2 >= 3 and h3 >= 2 bonus branches."""
    html = (
        "<h2>S1</h2><h2>S2</h2><h2>S3</h2>"
        "<h3>Sub1</h3><h3>Sub2</h3>"
    )
    result = score_content_structure_aeo(html, "", "h2,h3")
    assert result["h2_count"] >= 3
    assert result["h3_count"] >= 2
    assert result["structure_score"] > 0


def _crawl_df() -> pd.DataFrame:
    """Synthetic crawl DataFrame covering a variety of page types."""
    return pd.DataFrame([
        {
            "url": "https://ex.com/",
            "status": "200",
            "title": "Home",
            "h1": "Home",
            "word_count": 400,
            "content_excerpt": "Widgets are devices used for many purposes. - bullet one",
            "html": (
                "<main><article>"
                "<h1>Home</h1><h2>Section 1</h2><h2>Section 2</h2>"
                "<h3>Sub</h3><pre><code>example()</code></pre>"
                "<table><tr><td>data</td></tr></table>"
                "<button>Copy for AI</button>"
                "</article></main>"
            ),
            "heading_sequence": "h1,h2,h3",
            "fetch_method": "static",
            "page_analysis": json.dumps({"json_ld_types": ["Organization"]}),
        },
        {
            "url": "https://ex.com/docs/intro",
            "status": "200",
            "title": "Introduction",
            "h1": "Introduction",
            "word_count": 800,
            "content_excerpt": "This guide explains how to get started.",
            "html": "<main><h1>Intro</h1><h2>Setup</h2></main>",
            "heading_sequence": "h1,h2",
            "fetch_method": "static",
            "page_analysis": "{}",
        },
        {
            "url": "https://ex.com/docs/api",
            "status": "200",
            "title": "API Reference",
            "h1": "API",
            "word_count": 1200,
            "content_excerpt": "API reference for the platform.",
            "html": "<main><h1>API</h1><h2>Auth</h2><h2>Endpoints</h2></main>",
            "heading_sequence": "h1,h2",
            "fetch_method": "static",
            "page_analysis": "{}",
        },
        {
            "url": "https://ex.com/about",
            "status": "200",
            "title": "About",
            "h1": "About",
            "word_count": 200,
            "content_excerpt": "About us.",
            "html": "<h1>About</h1>",
            "heading_sequence": "h1",
            "fetch_method": "static",
            "page_analysis": "{}",
        },
        {
            "url": "https://ex.com/missing",
            "status": "404",
            "title": "",
            "word_count": 0,
            "html": "",
            "heading_sequence": "",
            "fetch_method": "static",
            "page_analysis": "{}",
        },
    ])


def _empty_df() -> pd.DataFrame:
    return pd.DataFrame()


# ---------------------------------------------------------------------------
# get_agents_md_status
# ---------------------------------------------------------------------------

def test_get_agents_md_status_not_found(conn: MagicMock, ctx: Ctx) -> None:
    import requests as _requests
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch("requests.get", side_effect=_requests.RequestException("timeout")):
        result = ar_mod.get_agents_md_status(conn, ctx, {})
    assert result["found"] is False
    assert result["domain"] == "ex.com"


def test_get_agents_md_status_found(conn: MagicMock, ctx: Ctx) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "# Agent instructions\nThis project is a Python stack.\nKey paths: src/"
    mock_resp.content = mock_resp.text.encode()
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch("requests.get", return_value=mock_resp):
        result = ar_mod.get_agents_md_status(conn, ctx, {})
    assert result["found"] is True
    assert result["domain"] == "ex.com"
    assert result["content_score"] >= 1


# ---------------------------------------------------------------------------
# get_skill_md_status
# ---------------------------------------------------------------------------

def test_get_skill_md_status_not_found(conn: MagicMock, ctx: Ctx) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    mock_resp.text = ""
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch("requests.get", return_value=mock_resp):
        result = ar_mod.get_skill_md_status(conn, ctx, {})
    assert result["found"] is False


def test_get_skill_md_status_found(conn: MagicMock, ctx: Ctx) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "# Skill\nDescription: API access\nInput: property_id\nConstraints: read-only\nExample: call x"
    mock_resp.content = mock_resp.text.encode()
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch("requests.get", return_value=mock_resp):
        result = ar_mod.get_skill_md_status(conn, ctx, {})
    assert result["found"] is True
    assert result["skill_content_score"] > 0


# ---------------------------------------------------------------------------
# get_agent_permissions_status
# ---------------------------------------------------------------------------

def test_get_agent_permissions_status_not_found(conn: MagicMock, ctx: Ctx) -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    mock_resp.text = ""
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch("requests.get", return_value=mock_resp):
        result = ar_mod.get_agent_permissions_status(conn, ctx, {})
    assert result["found"] is False


def test_get_agent_permissions_invalid_json(conn: MagicMock, ctx: Ctx) -> None:
    """Bad JSON body exercises json.JSONDecodeError branch (lines 191-192)."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "not valid json {"
    mock_resp.content = b"not valid json {"
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch("requests.get", return_value=mock_resp):
        result = ar_mod.get_agent_permissions_status(conn, ctx, {})
    assert result["found"] is True
    assert result["valid_json"] is False
    assert result["parse_error"] is not None


def test_get_agent_permissions_status_found(conn: MagicMock, ctx: Ctx) -> None:
    payload = json.dumps({"allowed_tools": ["read"], "scope": "https://ex.com/"})
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = payload
    mock_resp.content = payload.encode()
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch("requests.get", return_value=mock_resp):
        result = ar_mod.get_agent_permissions_status(conn, ctx, {})
    assert result["found"] is True
    assert result["valid_json"] is True
    assert result["has_allowed_tools"] is True


# ---------------------------------------------------------------------------
# get_token_budget_summary
# ---------------------------------------------------------------------------

def test_get_token_budget_summary_empty(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_empty_df()):
        result = ar_mod.get_token_budget_summary(conn, ctx, {})
    assert result["total_pages"] == 0


def test_get_token_budget_summary_with_data(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()):
        result = ar_mod.get_token_budget_summary(conn, ctx, {})
    assert result["total_pages"] > 0
    assert "p50_tokens" in result
    assert "p95_tokens" in result
    assert 0 <= result["budget_score"] <= 15
    assert result["provenance"] == "Estimated"


def test_get_token_budget_summary_none_df(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=None):
        result = ar_mod.get_token_budget_summary(conn, ctx, {})
    assert result.get("missing") is True


# ---------------------------------------------------------------------------
# list_oversized_pages_for_agents
# ---------------------------------------------------------------------------

def test_list_oversized_pages_empty(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_empty_df()):
        result = ar_mod.list_oversized_pages_for_agents(conn, ctx, {})
    assert result["total"] == 0


def test_list_oversized_pages_low_threshold(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()):
        # Setting warn threshold very low forces all pages to be "oversized"
        result = ar_mod.list_oversized_pages_for_agents(conn, ctx, {"warn_tokens": 1})
    assert result["total"] > 0
    assert isinstance(result["pages"], list)


# ---------------------------------------------------------------------------
# get_content_structure_aeo_summary
# ---------------------------------------------------------------------------

def test_get_content_structure_aeo_empty(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_empty_df()):
        result = ar_mod.get_content_structure_aeo_summary(conn, ctx, {})
    assert result["total_pages"] == 0


def test_get_content_structure_aeo_none(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=None):
        result = ar_mod.get_content_structure_aeo_summary(conn, ctx, {})
    assert result.get("missing") is True


def test_get_content_structure_aeo_with_data(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()):
        result = ar_mod.get_content_structure_aeo_summary(conn, ctx, {})
    assert result["total_pages"] > 0
    assert 0 <= result["site_structure_score"] <= 25
    assert "pages_with_h2" in result
    assert result["provenance"] == "Estimated"


# ---------------------------------------------------------------------------
# get_markdown_availability_summary
# ---------------------------------------------------------------------------

def test_get_markdown_availability_empty(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_empty_df()):
        result = ar_mod.get_markdown_availability_summary(conn, ctx, {})
    assert result["total_doc_pages"] == 0


def test_get_markdown_availability_none(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=None):
        result = ar_mod.get_markdown_availability_summary(conn, ctx, {})
    assert result.get("missing") is True


def test_get_markdown_availability_with_data(conn: MagicMock, ctx: Ctx) -> None:
    # Mock HEAD request to return 404 (no markdown sibling)
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    with patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()), \
         patch("requests.head", return_value=mock_resp):
        result = ar_mod.get_markdown_availability_summary(conn, ctx, {"probe_limit": 2})
    assert result["total_doc_pages"] > 0
    assert "md_source_pct" in result


# ---------------------------------------------------------------------------
# list_pages_agent_unfriendly
# ---------------------------------------------------------------------------

def test_list_pages_agent_unfriendly_empty(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_empty_df()):
        result = ar_mod.list_pages_agent_unfriendly(conn, ctx, {})
    assert result["total"] == 0


def test_list_pages_agent_unfriendly_low_threshold(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()):
        result = ar_mod.list_pages_agent_unfriendly(conn, ctx, {"warn_tokens": 1})
    assert isinstance(result["pages"], list)
    assert result["provenance"] == "Estimated"


# ---------------------------------------------------------------------------
# get_copy_for_ai_signals
# ---------------------------------------------------------------------------

def test_get_copy_for_ai_empty(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_empty_df()):
        result = ar_mod.get_copy_for_ai_signals(conn, ctx, {})
    assert result["total_pages"] == 0


def test_get_copy_for_ai_none(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=None):
        result = ar_mod.get_copy_for_ai_signals(conn, ctx, {})
    assert result.get("missing") is True


def test_get_copy_for_ai_with_data(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()):
        result = ar_mod.get_copy_for_ai_signals(conn, ctx, {})
    assert result["total_pages"] > 0
    assert 0 <= result["ux_score"] <= 10
    # Homepage has Copy for AI button in fixture
    assert result["pages_with_copy_for_ai"] >= 1


# ---------------------------------------------------------------------------
# list_pages_missing_copy_for_ai
# ---------------------------------------------------------------------------

def test_list_pages_missing_copy_for_ai_empty(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_empty_df()):
        result = ar_mod.list_pages_missing_copy_for_ai(conn, ctx, {})
    assert result["total"] == 0


def test_list_pages_missing_copy_for_ai_with_data(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()):
        result = ar_mod.list_pages_missing_copy_for_ai(conn, ctx, {})
    assert isinstance(result["pages"], list)
    # doc pages without copy-for-ai are listed
    for page in result["pages"]:
        assert "url" in page


# ---------------------------------------------------------------------------
# get_agent_readiness_score
# ---------------------------------------------------------------------------

def test_get_agent_readiness_score_no_domain(conn: MagicMock, ctx: Ctx) -> None:
    with patch.object(Ctx, "resolve_property_domain", return_value=""), \
         patch.object(Ctx, "load_crawl_df", return_value=_empty_df()):
        result = ar_mod.get_agent_readiness_score(conn, ctx, {})
    assert "percentage" in result
    assert "grade" in result
    assert result["grade"] in ("A", "B", "C", "D", "F")


def test_get_agent_readiness_score_full(conn: MagicMock, ctx: Ctx) -> None:
    # Mock all HTTP calls
    agents_resp = MagicMock()
    agents_resp.status_code = 200
    agents_resp.text = "# Instructions\nThis project uses Python.\nKey paths: src/\nWhere to edit: see below."
    agents_resp.content = agents_resp.text.encode()

    not_found = MagicMock()
    not_found.status_code = 404
    not_found.text = ""
    not_found.content = b""

    def side_effect(url: str, **kwargs):
        if "AGENTS.md" in url or "CLAUDE.md" in url or "AGENT.md" in url or "GEMINI.md" in url or "agents.md" in url:
            return agents_resp
        return not_found

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()), \
         patch("requests.get", side_effect=side_effect):
        result = ar_mod.get_agent_readiness_score(conn, ctx, {})

    assert 0 <= result["percentage"] <= 100
    assert result["grade"] in ("A", "B", "C", "D", "F")
    assert "categories" in result
    cats = result["categories"]
    assert "discovery" in cats
    assert "content_structure" in cats
    assert "token_economics" in cats
    assert "capability_signaling" in cats
    assert "ux_bridge" in cats
    assert all(0 <= cats[k]["score"] <= cats[k]["max"] for k in cats)
    assert result["provenance"] == "Crawl + Live HTTP"


# ---------------------------------------------------------------------------
# generate_agent_readiness_bundle
# ---------------------------------------------------------------------------

def test_token_budget_only_non_2xx_pages(conn: MagicMock, ctx: Ctx) -> None:
    """All-404 crawl hits the empty pages_data path (line 267)."""
    non_2xx = pd.DataFrame([{"url": "https://ex.com/x", "status": "404", "html": "", "word_count": 0, "page_analysis": "{}"}])
    with patch.object(Ctx, "load_crawl_df", return_value=non_2xx):
        result = ar_mod.get_token_budget_summary(conn, ctx, {})
    assert result["total_pages"] == 0


def test_content_structure_only_non_2xx(conn: MagicMock, ctx: Ctx) -> None:
    """All-404 crawl hits total=0 path (line 376)."""
    non_2xx = pd.DataFrame([{"url": "https://ex.com/x", "status": "404", "html": "", "page_analysis": "{}"}])
    with patch.object(Ctx, "load_crawl_df", return_value=non_2xx):
        result = ar_mod.get_content_structure_aeo_summary(conn, ctx, {})
    assert result["total_pages"] == 0


def test_markdown_availability_no_doc_pages(conn: MagicMock, ctx: Ctx) -> None:
    """No doc-like URLs returns the 'no doc-like URLs' note (line 468)."""
    no_docs = pd.DataFrame([
        {"url": "https://ex.com/", "status": "200", "html": "", "word_count": 200, "fetch_method": "static", "page_analysis": "{}"},
    ])
    with patch.object(Ctx, "load_crawl_df", return_value=no_docs):
        result = ar_mod.get_markdown_availability_summary(conn, ctx, {})
    assert result["total_doc_pages"] == 0
    assert "note" in result


def test_markdown_availability_md_found(conn: MagicMock, ctx: Ctx) -> None:
    """Exercise lines 415-418: .html path and successful HEAD probe."""
    doc_df = pd.DataFrame([{
        "url": "https://ex.com/docs/page.html",
        "status": "200",
        "html": "",
        "word_count": 5,
        "fetch_method": "static",
        "page_analysis": "{}",
    }])
    md_resp = MagicMock()
    md_resp.status_code = 200
    error_resp = MagicMock()
    error_resp.status_code = 404
    with patch.object(Ctx, "load_crawl_df", return_value=doc_df), \
         patch("requests.head", return_value=md_resp):
        result = ar_mod.get_markdown_availability_summary(conn, ctx, {"probe_limit": 1})
    assert result["pages_with_md_source"] == 1


def test_markdown_availability_head_exception(conn: MagicMock, ctx: Ctx) -> None:
    """HEAD request raises RequestException — line 418 (except pass)."""
    import requests as _requests
    doc_df = pd.DataFrame([{
        "url": "https://ex.com/docs/page",
        "status": "200",
        "html": "",
        "word_count": 5,
        "fetch_method": "static",
        "page_analysis": "{}",
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=doc_df), \
         patch("requests.head", side_effect=_requests.RequestException("head fail")):
        result = ar_mod.get_markdown_availability_summary(conn, ctx, {"probe_limit": 1})
    assert result["pages_with_md_source"] == 0


def test_markdown_availability_js_empty_counted(conn: MagicMock, ctx: Ctx) -> None:
    """word_count bad string hits except branch (lines 451-452) and js_empty_count increment."""
    doc_df = pd.DataFrame([{
        "url": "https://ex.com/docs/intro",
        "status": "200",
        "html": "",
        "word_count": "bad",   # triggers ValueError
        "fetch_method": "static",
        "page_analysis": "{}",
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=doc_df), \
         patch("requests.head", return_value=MagicMock(status_code=404)):
        result = ar_mod.get_markdown_availability_summary(conn, ctx, {"probe_limit": 0})
    # word_count bad -> 0 -> js_empty path
    assert result["js_empty_pages"] >= 1


def test_agent_unfriendly_bad_word_count(conn: MagicMock, ctx: Ctx) -> None:
    """word_count bad string hits except branch (lines 529-530) in list_pages_agent_unfriendly."""
    bad_wc_df = pd.DataFrame([{
        "url": "https://ex.com/page",
        "status": "200",
        "title": "Test",
        "html": "",
        "content_excerpt": "",
        "word_count": "bad",
        "heading_sequence": "",
        "fetch_method": "static",
        "page_analysis": "{}",
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=bad_wc_df):
        result = ar_mod.list_pages_agent_unfriendly(conn, ctx, {})
    assert isinstance(result["pages"], list)


def test_copy_for_ai_doc_page_with_signal(conn: MagicMock, ctx: Ctx) -> None:
    """Ensure doc page with copy signal increments doc_with_copy (line 598)."""
    doc_df = pd.DataFrame([{
        "url": "https://ex.com/docs/intro",
        "status": "200",
        "title": "Docs",
        "html": "<div>Copy for AI</div>",
        "word_count": 200,
        "heading_sequence": "h1",
        "fetch_method": "static",
        "page_analysis": "{}",
    }])
    with patch.object(Ctx, "load_crawl_df", return_value=doc_df):
        result = ar_mod.get_copy_for_ai_signals(conn, ctx, {})
    assert result["doc_pages_with_copy_for_ai"] >= 1
    assert result["doc_pages_pct"] > 0


def test_agent_readiness_score_http_exception(conn: MagicMock, ctx: Ctx) -> None:
    """Exercise the except branch in ThreadPoolExecutor (lines 698-699)."""
    def raise_on_call(domain):
        raise RuntimeError("http error")

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch.object(Ctx, "load_crawl_df", return_value=_empty_df()), \
         patch("website_profiling.tools.audit_tools.agent_readiness._fetch_agents_md", side_effect=raise_on_call), \
         patch("website_profiling.tools.audit_tools.agent_readiness._fetch_llms_txt", side_effect=raise_on_call), \
         patch("website_profiling.tools.audit_tools.agent_readiness._score_robots_ai_access", side_effect=raise_on_call), \
         patch("website_profiling.tools.audit_tools.agent_readiness._fetch_skill_md", side_effect=raise_on_call), \
         patch("website_profiling.tools.audit_tools.agent_readiness._fetch_agent_permissions", side_effect=raise_on_call), \
         patch("website_profiling.tools.audit_tools.agent_readiness._score_meta_signals", side_effect=raise_on_call):
        result = ar_mod.get_agent_readiness_score(conn, ctx, {})
    assert "percentage" in result


def test_agent_readiness_score_with_permissions(conn: MagicMock, ctx: Ctx) -> None:
    """Exercise capability_signaling score with perms found + valid_json + has_scope (lines 733-737)."""
    perms = {"allowed_tools": ["read"], "scope": "https://ex.com/"}
    import json as _json
    perms_resp = MagicMock()
    perms_resp.status_code = 200
    perms_resp.text = _json.dumps(perms)
    perms_resp.content = perms_resp.text.encode()

    skill_resp = MagicMock()
    skill_resp.status_code = 200
    skill_resp.text = "# Skill\nDescription: API access\nInput: prop\nConstraints: read-only\nExample: x"
    skill_resp.content = skill_resp.text.encode()

    not_found = MagicMock()
    not_found.status_code = 404
    not_found.text = ""
    not_found.content = b""

    def side(url: str, **kwargs):
        if "agent-permissions" in url:
            return perms_resp
        if "skill.md" in url or "SKILL.md" in url:
            return skill_resp
        return not_found

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch.object(Ctx, "load_crawl_df", return_value=_empty_df()), \
         patch("requests.get", side_effect=side):
        result = ar_mod.get_agent_readiness_score(conn, ctx, {})
    assert result["components"]["agent_permissions"] > 0


def test_generate_agent_readiness_bundle_no_top_pages(conn: MagicMock, ctx: Ctx) -> None:
    """No top_pages in payload exercises line 811 (fallback URL)."""
    not_found = MagicMock()
    not_found.status_code = 404
    not_found.text = ""
    not_found.content = b""
    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch.object(Ctx, "load_crawl_df", return_value=_empty_df()), \
         patch.object(Ctx, "load_payload", return_value={}), \
         patch("requests.get", return_value=not_found):
        result = ar_mod.generate_agent_readiness_bundle(conn, ctx, {})
    assert "agents_md" in result
    assert "https://ex.com/" in result["agents_md"]


def test_grade_f_fallthrough() -> None:
    """_grade returns F for score 0 (line 61 fallthrough)."""
    assert ar_mod._grade(0) == "F"
    assert ar_mod._grade(-1) == "F"


def test_generate_agent_readiness_bundle(conn: MagicMock, ctx: Ctx) -> None:
    not_found = MagicMock()
    not_found.status_code = 404
    not_found.text = ""
    not_found.content = b""

    with patch.object(Ctx, "resolve_property_domain", return_value="ex.com"), \
         patch.object(Ctx, "load_crawl_df", return_value=_crawl_df()), \
         patch.object(Ctx, "load_payload", return_value={"site_title": "Example Site", "top_pages": [{"url": "https://ex.com/"}]}), \
         patch("requests.get", return_value=not_found):
        result = ar_mod.generate_agent_readiness_bundle(conn, ctx, {})

    assert result["domain"] == "ex.com"
    assert "agents_md" in result
    assert "skill_md" in result
    assert "agent_permissions_json" in result
    assert isinstance(result["missing_files"], list)
    # All discovery files should be missing since HTTP returns 404
    assert "AGENTS.md" in result["missing_files"]
    assert "llms.txt" in result["missing_files"]
    # JSON is valid
    import json
    perms = json.loads(result["agent_permissions_json"])
    assert perms["scope"] == "https://ex.com/"
