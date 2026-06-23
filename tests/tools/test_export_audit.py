"""Tests for audit export helpers."""
from __future__ import annotations

from website_profiling.tools import export_audit


def test_export_csv_contains_site_name(monkeypatch):
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
    csv_out = export_audit.export_audit_csv()
    assert "Example Corp" in csv_out
    assert "Missing title" in csv_out


def test_export_json_returns_payload(monkeypatch):
    payload = {"site_name": "JSON Test", "categories": [], "links": []}
    monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)
    json_out = export_audit.export_audit_json()
    assert '"JSON Test"' in json_out


def test_export_csv_executive_summary_and_llm_recommendation(monkeypatch):
    payload = {
        "site_name": "Exec Site",
        "report_generated_at": "2026-06-01",
        "executive_summary": {
            "source": "ai_insights",
            "summary": "Overall health is strong with two high-priority gaps.",
            "priorities": ["Fix canonical tags on /blog/", "Reduce LCP on homepage"],
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
    csv_out = export_audit.export_audit_csv()
    assert "# Executive summary" in csv_out
    assert "llm_recommendation" in csv_out
    assert "Compress hero image" in csv_out
