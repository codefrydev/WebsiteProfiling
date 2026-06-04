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
