"""Unit tests for agent readiness helpers and tools."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.tools.audit_tools._aeo_helpers import (
    count_tokens,
    detect_copy_for_ai,
    is_doc_like_url,
    score_agents_md_content,
    score_content_structure_aeo,
    strip_html_to_text,
)
from website_profiling.tools.audit_tools.geo.agent_readiness import (
    _fetch_agents_md,
    _fetch_agent_permissions,
    _fetch_skill_md,
    _grade,
    _score_skill_md_content,
)


# ---------------------------------------------------------------------------
# _aeo_helpers: is_doc_like_url
# ---------------------------------------------------------------------------

def test_is_doc_like_url_positive() -> None:
    assert is_doc_like_url("https://example.com/docs/intro")
    assert is_doc_like_url("https://example.com/guide/getting-started")
    assert is_doc_like_url("https://example.com/api/reference")
    assert is_doc_like_url("https://example.com/tutorial/basic.md")
    assert is_doc_like_url("https://example.com/help/faq")
    assert is_doc_like_url("https://example.com/wiki/main")
    assert is_doc_like_url("https://example.com/learn/python")


def test_is_doc_like_url_negative() -> None:
    assert not is_doc_like_url("https://example.com/")
    assert not is_doc_like_url("https://example.com/blog/post-1")
    assert not is_doc_like_url("https://example.com/products/widget")
    assert not is_doc_like_url("")


# ---------------------------------------------------------------------------
# _aeo_helpers: strip_html_to_text
# ---------------------------------------------------------------------------

def test_strip_html_to_text_basic() -> None:
    result = strip_html_to_text("<p>Hello <strong>world</strong>!</p>")
    assert "Hello" in result
    assert "world" in result
    assert "<" not in result


def test_strip_html_to_text_empty() -> None:
    assert strip_html_to_text("") == ""
    assert strip_html_to_text("   ") == ""


# ---------------------------------------------------------------------------
# _aeo_helpers: count_tokens
# ---------------------------------------------------------------------------

def test_count_tokens_empty() -> None:
    assert count_tokens("") == 0


def test_count_tokens_approximate() -> None:
    # A single short word should be 1-3 tokens
    result = count_tokens("hello")
    assert 1 <= result <= 5


def test_count_tokens_longer_text() -> None:
    text = "The quick brown fox jumps over the lazy dog. " * 100
    result = count_tokens(text)
    # Should be in the hundreds
    assert result > 50
    assert result < 5000


# ---------------------------------------------------------------------------
# _aeo_helpers: score_agents_md_content
# ---------------------------------------------------------------------------

def test_score_agents_md_minimal() -> None:
    result = score_agents_md_content("")
    assert result["content_score"] == 0
    assert result["has_purpose_description"] is False


def test_score_agents_md_full() -> None:
    text = """
    This is a description of what this project does.
    Stack: Python, Next.js, PostgreSQL.
    Key paths: src/, web/, tests/
    Where to edit: See below.
    Run: ./local-run
    """
    result = score_agents_md_content(text)
    assert result["has_purpose_description"] is True
    assert result["has_stack_or_paths"] is True
    assert result["has_edit_targets"] is True
    assert result["content_score"] == 3


def test_score_agents_md_partial() -> None:
    text = "This project is a tool for SEO analysis."
    result = score_agents_md_content(text)
    assert result["has_purpose_description"] is True
    assert result["content_score"] >= 1


# ---------------------------------------------------------------------------
# _aeo_helpers: detect_copy_for_ai
# ---------------------------------------------------------------------------

def test_detect_copy_for_ai_positive_text() -> None:
    html = '<button>Copy for AI</button>'
    assert detect_copy_for_ai(html) is True


def test_detect_copy_for_ai_positive_markdown() -> None:
    html = '<a href="#">Copy as Markdown</a>'
    assert detect_copy_for_ai(html) is True


def test_detect_copy_for_ai_positive_raw() -> None:
    html = '<a href="/raw">View Raw</a>'
    assert detect_copy_for_ai(html) is True


def test_detect_copy_for_ai_positive_aria() -> None:
    html = '<button aria-label="Copy to clipboard">📋</button>'
    assert detect_copy_for_ai(html) is True


def test_detect_copy_for_ai_negative() -> None:
    html = '<div><p>Just regular content here.</p></div>'
    assert detect_copy_for_ai(html) is False


def test_detect_copy_for_ai_empty() -> None:
    assert detect_copy_for_ai("") is False


# ---------------------------------------------------------------------------
# _aeo_helpers: score_content_structure_aeo
# ---------------------------------------------------------------------------

def test_score_content_structure_rich() -> None:
    html = (
        '<main><article>'
        '<h1>Title</h1>'
        '<h2>Section 1</h2><h2>Section 2</h2><h2>Section 3</h2>'
        '<h3>Subsection</h3><h3>Sub2</h3>'
        '<pre><code>example()</code></pre>'
        '<table><tr><td>data</td></tr></table>'
        '</article></main>'
    )
    result = score_content_structure_aeo(html, "", "h1,h2,h3")
    assert result["has_h1"] is True
    assert result["has_h2"] is True
    assert result["has_main"] is True
    assert result["has_article"] is True
    assert result["code_blocks"] >= 1
    assert result["tables"] >= 1
    assert result["structure_score"] > 15


def test_score_content_structure_empty() -> None:
    result = score_content_structure_aeo("", "", "")
    assert result["structure_score"] == 0
    assert result["has_h1"] is False
    assert result["has_main"] is False


def test_score_content_structure_minimal() -> None:
    html = '<html><body><h1>Title</h1><h2>Section</h2></body></html>'
    result = score_content_structure_aeo(html, "", "h1,h2")
    assert result["has_h1"] is True
    assert result["has_h2"] is True
    assert result["structure_score"] > 0


# ---------------------------------------------------------------------------
# agent_readiness: _grade
# ---------------------------------------------------------------------------

def test_grade_bands() -> None:
    assert _grade(95) == "A"
    assert _grade(90) == "A"
    assert _grade(89) == "B"
    assert _grade(75) == "B"
    assert _grade(74) == "C"
    assert _grade(60) == "C"
    assert _grade(59) == "D"
    assert _grade(40) == "D"
    assert _grade(39) == "F"
    assert _grade(0) == "F"


# ---------------------------------------------------------------------------
# agent_readiness: _score_skill_md_content
# ---------------------------------------------------------------------------

def test_score_skill_md_empty() -> None:
    result = _score_skill_md_content("")
    assert result["skill_content_score"] == 0


def test_score_skill_md_full() -> None:
    text = """
    Description: This skill provides SEO audit capabilities.
    Input: property_id (required)
    Constraints: read-only, rate limited
    Example: get_report_summary for site analysis
    """
    result = _score_skill_md_content(text)
    assert result["has_description"] is True
    assert result["has_inputs"] is True
    assert result["has_constraints"] is True
    assert result["has_examples"] is True
    assert result["skill_content_score"] == 10


# ---------------------------------------------------------------------------
# agent_readiness: _fetch_agents_md (mocked)
# ---------------------------------------------------------------------------

def test_fetch_agents_md_not_found() -> None:
    import requests as _requests
    with patch("requests.get", side_effect=_requests.RequestException("timeout")):
        result = _fetch_agents_md("example.com")
    assert result["found"] is False
    assert "checked_urls" in result


def test_fetch_agents_md_found() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "# Agent instructions\nThis is a Python project.\nKey paths: src/"
    mock_resp.content = mock_resp.text.encode()
    with patch("requests.get", return_value=mock_resp):
        result = _fetch_agents_md("example.com")
    assert result["found"] is True
    assert result["url"].endswith("/AGENTS.md") or "/CLAUDE.md" in result["url"] or "/AGENT.md" in result["url"]
    assert result["size_bytes"] > 0


def test_fetch_agents_md_no_domain() -> None:
    result = _fetch_agents_md("")
    assert result["found"] is False
    assert result.get("error") == "domain unknown"


# ---------------------------------------------------------------------------
# agent_readiness: _fetch_skill_md (mocked)
# ---------------------------------------------------------------------------

def test_fetch_skill_md_not_found() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    mock_resp.text = ""
    with patch("requests.get", return_value=mock_resp):
        result = _fetch_skill_md("example.com")
    assert result["found"] is False


def test_fetch_skill_md_found() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "# Skill\nDescription: does things\nInput: x\nConstraints: read-only\nExample: call foo"
    mock_resp.content = mock_resp.text.encode()
    with patch("requests.get", return_value=mock_resp):
        result = _fetch_skill_md("example.com")
    assert result["found"] is True
    assert result["skill_content_score"] > 0


def test_fetch_skill_md_no_domain() -> None:
    result = _fetch_skill_md("")
    assert result["found"] is False
    assert result.get("error") == "domain unknown"


# ---------------------------------------------------------------------------
# agent_readiness: _fetch_agent_permissions (mocked)
# ---------------------------------------------------------------------------

def test_fetch_agent_permissions_not_found() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 404
    mock_resp.text = ""
    with patch("requests.get", return_value=mock_resp):
        result = _fetch_agent_permissions("example.com")
    assert result["found"] is False


def test_fetch_agent_permissions_found_valid_json() -> None:
    import json as _json
    perms = {"allowed_tools": ["read"], "scope": "https://example.com/", "rate_limits": {"rpm": 30}}
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = _json.dumps(perms)
    mock_resp.content = mock_resp.text.encode()
    with patch("requests.get", return_value=mock_resp):
        result = _fetch_agent_permissions("example.com")
    assert result["found"] is True
    assert result["valid_json"] is True
    assert result["has_allowed_tools"] is True
    assert result["has_scope"] is True
    assert result["parse_error"] is None


def test_fetch_agent_permissions_found_invalid_json() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "not json {"
    mock_resp.content = b"not json {"
    with patch("requests.get", return_value=mock_resp):
        result = _fetch_agent_permissions("example.com")
    assert result["found"] is True
    assert result["valid_json"] is False
    assert result["parse_error"] is not None


def test_fetch_agent_permissions_no_domain() -> None:
    result = _fetch_agent_permissions("")
    assert result["found"] is False
    assert result.get("error") == "domain unknown"
