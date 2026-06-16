"""Tests for optional audit hooks."""
from __future__ import annotations

import json
import sys
from unittest.mock import patch

import pandas as pd

from website_profiling.reporting.optional_audits import (
    amp_audit_issues,
    apply_optional_audits,
    html_validation_issues,
    pagination_issues,
    spell_check_issues,
)


def test_pagination_issues_from_page_analysis():
    df = pd.DataFrame([
        {
            "url": "https://example.com/page/2",
            "status": "200",
            "page_analysis": json.dumps({"pagination": {"rel_prev": "https://example.com/page/1", "rel_next": None}}),
        },
    ])
    issues = pagination_issues(df)
    assert any("rel=prev" in i["message"] for i in issues)


def test_amp_audit_missing_canonical():
    df = pd.DataFrame([
        {
            "url": "https://example.com/amp/article",
            "status": "200",
            "canonical_url": "",
            "content_type": "text/html",
            "page_analysis": "{}",
        },
    ])
    issues = amp_audit_issues(df)
    assert len(issues) == 1


def test_spell_check_issues_missing_pyspellchecker():
    df = pd.DataFrame([
        {
            "url": "https://example.com/typo",
            "status": "200",
            "content_excerpt": "This sentense has many misspelled wrds that should trigger heuristics.",
        },
    ])
    with patch.dict(sys.modules, {"spellchecker": None}):
        issues, skip = spell_check_issues(df)
    assert issues == []
    assert skip and "pyspellchecker" in skip


def test_html_validation_issues_missing_html5lib():
    html = "<html><head><title>A</title></head><body>" + ("x" * 120) + "</body></html>"
    df = pd.DataFrame([{"url": "https://example.com", "html": html}])
    with patch.dict(sys.modules, {"html5lib": None}):
        issues, use_parser = html_validation_issues(df)
    assert use_parser is False
    assert isinstance(issues, list)


def test_apply_optional_audits_spell_skipped_without_package(capsys):
    categories = [
        {"id": "technical_seo", "name": "Technical", "issues": [], "recommendations": []},
        {"id": "intelligence", "name": "Content", "issues": [], "recommendations": []},
        {"id": "html_accessibility", "name": "A11y", "issues": [], "recommendations": []},
    ]
    df = pd.DataFrame([{"url": "https://example.com", "status": "200", "page_analysis": "{}"}])
    with patch.dict(sys.modules, {"spellchecker": None}):
        meta = apply_optional_audits(categories, df, {"enable_spell_check": "true"})
    assert meta["spell_check_skipped"] == "pyspellchecker not installed (pip install -r requirements.txt)"
    assert "pyspellchecker" in capsys.readouterr().err
