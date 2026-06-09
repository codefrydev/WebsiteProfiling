"""Tests for optional audit hooks."""
from __future__ import annotations

import json

import pandas as pd

from website_profiling.reporting.optional_audits import (
    amp_audit_issues,
    apply_optional_audits,
    pagination_issues,
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


def test_apply_optional_audits_spell_skipped_without_package():
    categories = [
        {"id": "technical_seo", "name": "Technical", "issues": [], "recommendations": []},
        {"id": "intelligence", "name": "Content", "issues": [], "recommendations": []},
        {"id": "html_accessibility", "name": "A11y", "issues": [], "recommendations": []},
    ]
    df = pd.DataFrame([{"url": "https://example.com", "status": "200", "page_analysis": "{}"}])
    meta = apply_optional_audits(categories, df, {"enable_spell_check": "true"})
    assert isinstance(meta, dict)
