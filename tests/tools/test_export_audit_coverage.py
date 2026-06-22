"""Branch coverage for export_audit helpers."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.tools import export_audit
from website_profiling.tools.export_audit_data import (
    _executive_export_data,
    _executive_source_label,
    _format_report_date,
    _issue_recommendation,
    _issues_rows,
    _overall_score,
    _priority_sort_key,
    _score_band,
    _summary_lines,
)


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
            "not-a-dict",
        ],
        "report_meta": {
            "data_sources": ["Crawl", "GSC"],
            "google_fetched_at": "2026-06-06",
            "crawl_scope": {
                "pages_crawled": 50,
                "max_pages_configured": 100,
                "crawl_limited": True,
                "render_mode": "javascript",
                "js_concurrency": 4,
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
    rows = _issues_rows(payload)
    assert len(rows) >= 4

    legacy = _executive_export_data({"recommendations": ["Only legacy"]})
    assert "Only legacy" in legacy["summary"]

    assert _executive_source_label("ai_insights") == "AI insights"
    assert _executive_source_label("deterministic") == "Measured + Search Console"
    assert _executive_source_label("custom") == "custom"
    assert _executive_source_label("") == "Audit data"

    assert _format_report_date("") == "—"
    assert _format_report_date("not-a-date") == "not-a-date"
    assert "2026" in _format_report_date("2026-06-07T12:00:00")

    assert _overall_score({"categories": []}) is None
    assert _overall_score(payload) == 70

    assert _score_band(None) == ("—", "score-na")
    assert _score_band(85)[1] == "score-good"
    assert _score_band(65)[1] == "score-fair"
    assert _score_band(40)[1] == "score-poor"


def test_summary_lines_includes_scope() -> None:
    lines = dict(_summary_lines(_rich_payload()))
    assert lines["Property"] == "Coverage Site"
    assert "pages crawled" in lines["Crawl scope"]
    assert "JavaScript rendering" in lines["Crawl scope"]
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
    auto_lines = dict(_summary_lines(auto_scope))
    assert "auto rendering" in auto_lines["Crawl scope"]

    static_scope = {
        "report_meta": {"crawl_scope": {"pages_crawled": 5, "static_html_only": True}}
    }
    static_lines = dict(_summary_lines(static_scope))
    assert "static HTML only" in static_lines["Crawl scope"]


def test_issue_recommendation_prefers_llm_when_distinct() -> None:
    rec, llm = _issue_recommendation(
        {"recommendation": "Rule", "llm_recommendation": "LLM fix"}
    )
    assert rec == "LLM fix"
    assert llm == "LLM fix"


def test_priority_sort_key_unknown_priority() -> None:
    assert _priority_sort_key({"priority": "unknown"}) == 9


def test_summary_lines_browser_diagnostics() -> None:
    payload = {
        "report_meta": {
            "crawl_scope": {
                "pages_crawled": 10,
                "browser_diagnostics": {
                    "pages_with_console_errors": 2,
                    "total_console_errors": 5,
                    "pages_with_page_errors": 1,
                },
            }
        }
    }
    lines = dict(_summary_lines(payload))
    assert "Browser diagnostics" in lines
    assert "console errors" in lines["Browser diagnostics"]


def test_issue_priority_counts() -> None:
    from website_profiling.tools.export_audit_data import _issue_priority_counts

    counts = _issue_priority_counts([
        {"priority": "critical"},
        {"priority": "High"},
        {"priority": "unknown"},
    ])
    assert counts["critical"] == 1
    assert counts["high"] == 1
    assert counts["medium"] == 0


def test_export_json_and_csv(monkeypatch) -> None:
    payload = _rich_payload()
    monkeypatch.setattr(export_audit, "_load_payload", lambda _rid=None: payload)

    json_out = export_audit.export_audit_json()
    assert '"Coverage Site"' in json_out

    csv_out = export_audit.export_audit_csv()
    assert "data_sources" in csv_out
    assert "Measured + Search Console" in csv_out
