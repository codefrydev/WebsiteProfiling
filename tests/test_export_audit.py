"""Tests for audit export helpers."""
from __future__ import annotations

import pytest

from website_profiling.tools import export_audit


def test_export_html_contains_site_name(monkeypatch):
    payload = {
        "site_name": "Example Corp",
        "report_generated_at": "2026-01-01",
        "categories": [
            {
                "name": "Technical SEO",
                "issues": [
                    {
                        "priority": "high",
                        "message": "Missing title",
                        "url": "https://example.com/",
                        "recommendation": "Add a title tag",
                    }
                ],
            }
        ],
        "links": [{"url": "https://example.com/", "status": "200", "title": "Home"}],
    }

    monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)
    html_out = export_audit.export_audit_html()
    assert "Example Corp" in html_out
    assert "Missing title" in html_out
    assert "Data source glossary" in html_out


def test_export_pdf_returns_bytes(monkeypatch):
    pytest.importorskip("reportlab")
    payload = {"site_name": "PDF Test", "categories": [], "links": []}
    monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)
    pdf = export_audit.export_audit_pdf()
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"


def test_export_html_executive_summary_and_llm_recommendation(monkeypatch):
    payload = {
        "site_name": "Exec Site",
        "report_generated_at": "2026-06-01",
        "executive_summary": {
            "source": "ai_insights",
            "summary": "Overall health is strong with two high-priority gaps.",
            "priorities": ["Fix canonical tags on /blog/", "Reduce LCP on homepage"],
            "top_issues": [
                {
                    "priority": "high",
                    "message": "Slow LCP",
                    "url": "https://exec.example/",
                    "gsc_clicks": 120,
                }
            ],
        },
        "categories": [
            {
                "name": "Performance",
                "issues": [
                    {
                        "priority": "high",
                        "message": "Slow LCP",
                        "url": "https://exec.example/",
                        "recommendation": "Optimize images",
                        "llm_recommendation": "Compress hero image and preload LCP asset",
                    }
                ],
            }
        ],
        "links": [],
    }
    monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)
    html_out = export_audit.export_audit_html()
    csv_out = export_audit.export_audit_csv()
    assert "Executive summary" in html_out
    assert "AI insights" in html_out
    assert "Fix canonical tags on /blog/" in html_out
    assert "Top traffic-impacting issues" in html_out
    assert "Compress hero image" in html_out
    assert "# Executive summary" in csv_out
    assert "llm_recommendation" in csv_out
