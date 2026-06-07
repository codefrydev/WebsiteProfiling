"""Branch coverage for export_audit helpers."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.tools import export_audit


def _rich_payload() -> dict:
    issues = [
        {
            "priority": p,
            "message": f"Issue {i}",
            "url": f"https://example.com/{i}",
            "recommendation": f"Fix {i}",
        }
        for i, p in enumerate(["critical", "high", "medium", "low"] * 55)
    ]
    return {
        "site_name": "Coverage Site",
        "report_title": "Full Audit",
        "report_generated_at": "2026-06-07T12:00:00Z",
        "recommendations": ["Legacy rec one", "Legacy rec two"],
        "executive_summary": {
            "source": "deterministic",
            "summary": "Measured summary.",
            "priorities": ["Priority A"],
            "top_issues": [
                {
                    "priority": "high",
                    "message": "Top issue",
                    "url": "https://example.com/top",
                    "gsc_clicks": "bad",
                },
                {
                    "priority": "medium",
                    "message": "Zero clicks",
                    "url": "https://example.com/zero",
                    "gsc_clicks": 0,
                },
                {
                    "priority": "high",
                    "message": "x" * 120,
                    "url": "https://example.com/" + ("segment/" * 15),
                },
            ],
        },
        "categories": [
            {"name": "Technical SEO", "score": 85, "issues": issues},
            {"name": "Performance", "score": 55, "issues": issues[:2]},
            "not-a-dict",
            {"name": "Content", "score": "bad", "issues": ["not-an-issue", {"priority": "low", "message": "ok", "url": "u"}]},
            {"name": "Security", "score": None, "issues": []},
        ],
        "links": [
            {"url": "https://example.com/ok", "status": "200", "title": "OK", "inlinks": 3, "word_count": 100},
            {"url": "https://example.com/redirect", "status": "301", "title": "Redir"},
            {"url": "https://example.com/missing", "status": "404", "title": ""},
            {"url": "https://example.com/error", "status": "500", "title": "Err"},
            {"url": "https://example.com/custom", "status": "200", "custom_extract": "CEF"},
            "not-a-dict",
        ],
        "report_meta": {
            "data_sources": ["Crawl", "GSC"],
            "google_fetched_at": "2026-06-06",
            "export_logo_url": "https://cdn.example/logo.png",
            "crawl_scope": {
                "pages_crawled": 50,
                "max_pages_configured": 100,
                "crawl_limited": True,
                "render_mode": "javascript",
                "js_concurrency": 4,
                "browser_diagnostics": {
                    "pages_with_console_errors": 2,
                    "total_console_errors": 5,
                    "pages_with_page_errors": 1,
                },
            },
        },
        "summary": {
            "total_urls": 50,
            "indexable": 45,
            "issues_count": len(issues),
            "critical_issues": 55,
        },
        "status_counts": {"200": 40, "404": 10},
    }


def test_load_payload_success_and_missing() -> None:
    conn = MagicMock()
    payload = {"site_name": "Loaded"}

    with patch("website_profiling.tools.export_audit.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        with patch(
            "website_profiling.tools.export_audit.read_report_payload",
            return_value=payload,
        ):
            assert export_audit._load_payload(7) == payload

    with patch("website_profiling.tools.export_audit.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        with patch(
            "website_profiling.tools.export_audit.read_report_payload",
            return_value=None,
        ):
            with pytest.raises(FileNotFoundError, match="No report payload"):
                export_audit._load_payload()


def test_helper_functions_cover_branches() -> None:
    payload = _rich_payload()
    rows = export_audit._issues_rows(payload)
    assert len(rows) >= 4

    legacy = export_audit._executive_export_data({"recommendations": ["Only legacy"]})
    assert "Only legacy" in legacy["summary"]

    assert export_audit._executive_source_label("ai_insights") == "AI insights"
    assert export_audit._executive_source_label("deterministic") == "Measured + Search Console"
    assert export_audit._executive_source_label("custom") == "custom"
    assert export_audit._executive_source_label("") == "Audit data"

    html_block = export_audit._executive_summary_html(payload)
    assert "Executive summary" in html_block
    assert "Top traffic-impacting issues" in html_block

    assert export_audit._format_report_date("") == "—"
    assert export_audit._format_report_date("not-a-date") == "not-a-date"
    assert "2026" in export_audit._format_report_date("2026-06-07T12:00:00")

    assert export_audit._overall_score({"categories": []}) is None
    assert export_audit._overall_score(payload) == 70

    assert export_audit._score_band(None) == ("—", "score-na")
    assert export_audit._score_band(85)[1] == "score-good"
    assert export_audit._score_band(65)[1] == "score-fair"
    assert export_audit._score_band(40)[1] == "score-poor"

    cards = export_audit._category_cards_html(payload["categories"])
    assert "Technical SEO" in cards
    assert export_audit._category_cards_html([]).startswith("<p")


def test_summary_lines_includes_scope_and_diagnostics() -> None:
    lines = dict(export_audit._summary_lines(_rich_payload()))
    assert lines["Property"] == "Coverage Site"
    assert "pages crawled" in lines["Crawl scope"]
    assert "JavaScript rendering" in lines["Crawl scope"]
    assert "Browser diagnostics" in lines
    assert "Google data fetched" in lines
    assert "HTTP status mix" in lines
    assert lines["Critical issues"] == "55"


def test_summary_lines_auto_and_static_render_modes() -> None:
    auto_scope = {
        "report_meta": {
            "crawl_scope": {
                "pages_crawled": 10,
                "render_mode": "auto",
                "pages_static": 7,
                "pages_rendered": 3,
            }
        }
    }
    auto_lines = dict(export_audit._summary_lines(auto_scope))
    assert "auto rendering" in auto_lines["Crawl scope"]

    static_scope = {
        "report_meta": {"crawl_scope": {"pages_crawled": 5, "static_html_only": True}}
    }
    static_lines = dict(export_audit._summary_lines(static_scope))
    assert "static HTML only" in static_lines["Crawl scope"]


def test_issue_recommendation_prefers_llm_when_distinct() -> None:
    rec, llm = export_audit._issue_recommendation(
        {"recommendation": "Rule", "llm_recommendation": "LLM fix"}
    )
    assert rec == "LLM fix"
    assert llm == "LLM fix"


def test_export_json_csv_and_truncated_html(monkeypatch) -> None:
    payload = _rich_payload()
    monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)

    json_out = export_audit.export_audit_json()
    assert '"Coverage Site"' in json_out

    csv_out = export_audit.export_audit_csv()
    assert "data_sources" in csv_out
    assert "Measured + Search Console" in csv_out

    html_out = export_audit.export_audit_html()
    assert "Overall health score 70/100" in html_out
    assert "Showing 200 of" in html_out
    assert "Custom extract" in html_out
    assert "logo.png" in html_out


def test_export_pdf_full_branches(monkeypatch) -> None:
    pytest.importorskip("reportlab")
    payload = _rich_payload()
    monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)

    pdf = export_audit.export_audit_pdf()
    assert pdf[:4] == b"%PDF"


def test_export_pdf_truncates_long_issue_lists(monkeypatch) -> None:
    pytest.importorskip("reportlab")
    issues = [
        {
            "priority": "low",
            "message": "x" * 150,
            "url": "https://example.com/" + ("path/" * 20),
            "recommendation": "fix",
        }
        for _ in range(90)
    ]
    payload = {
        "site_name": "Truncate PDF",
        "categories": [{"name": "Technical SEO", "score": 80, "issues": issues}],
        "links": [],
    }
    monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)
    pdf = export_audit.export_audit_pdf()
    assert pdf[:4] == b"%PDF"


def test_export_pdf_requires_reportlab(monkeypatch) -> None:
    payload = {"site_name": "No PDF", "categories": [], "links": []}
    monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)

    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "reportlab.lib" or name.startswith("reportlab."):
            raise ImportError("no reportlab")
        return real_import(name, *args, **kwargs)

    with patch("builtins.__import__", side_effect=fake_import):
        with pytest.raises(RuntimeError, match="PDF export requires reportlab"):
            export_audit.export_audit_pdf()
