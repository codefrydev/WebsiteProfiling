"""Tests for reporting/compare_payload.py — parity with web compare."""
from __future__ import annotations

from website_profiling.reporting.compare_payload import (
    build_content_metrics,
    build_duplicate_deltas,
    build_full_compare,
    build_google_metrics,
    build_issue_deltas,
    build_lighthouse_url_deltas,
    build_priority_counts,
    build_redirect_deltas,
    build_security_deltas,
    build_seo_health_deltas,
    build_tech_deltas,
    build_url_set_diff,
    norm_report_url,
)


def _payload(**overrides) -> dict:
    base = {
        "report_generated_at": "2026-06-01",
        "summary": {"total_urls": 10, "count_2xx": 9, "count_4xx": 1, "success_rate": 90},
        "seo_health": {"missing_title": 1, "title_ok": 9, "thin_content": 2},
        "categories": [
            {"id": "tech", "name": "Technical", "score": 80, "issues": [
                {"priority": "High", "message": "Slow", "url": "https://ex.com/slow"},
            ]},
        ],
        "redirects": [{"url": "https://ex.com/old", "status": "301", "final_url": "https://ex.com/new"}],
        "security_findings": [{"url": "https://ex.com", "severity": "high", "finding_type": "hsts", "message": "x"}],
        "content_duplicates": [{"id": "d1", "representative_url": "https://ex.com/a", "member_count": 2}],
        "tech_stack_summary": {"technologies": [{"name": "WP", "count": 5}]},
        "lighthouse_by_url": {
            "https://ex.com/slow": {"performance": 40, "median_metrics": {"performance_score": 40, "seo_score": 80}},
        },
        "links": [
            {"url": "https://ex.com/slow", "status": "200", "inlinks": 2, "outlinks": 3, "word_count": 100, "response_time_ms": 200},
        ],
        "google": {"gsc": {"summary": {"clicks": 10, "impressions": 100}}, "ga4": {"summary": {"sessions": 5}}},
        "content_analytics": {"word_count_stats": {"mean": 300}},
        "social_coverage": {"og_coverage_pct": 80},
        "response_time_stats": {"p50": 100},
    }
    base.update(overrides)
    return base


def test_norm_report_url() -> None:
    assert norm_report_url("https://Ex.COM/page/") == "ex.com/page"


def test_issue_and_priority_deltas() -> None:
    cur = _payload()
    base = _payload(categories=[
        {"id": "tech", "name": "Technical", "score": 85, "issues": []},
    ])
    issues = build_issue_deltas(cur, base)
    assert any(i["kind"] == "new" for i in issues)
    counts = build_priority_counts(cur, base)
    assert counts[0]["priority"] == "Critical"


def test_lighthouse_redirect_security_dup_tech() -> None:
    cur = _payload()
    base = _payload(
        lighthouse_by_url={"https://ex.com/slow": {"performance": 90, "median_metrics": {"performance_score": 90}}},
        redirects=[],
        security_findings=[],
        content_duplicates=[],
        tech_stack_summary={"technologies": []},
    )
    assert build_lighthouse_url_deltas(cur, base)
    assert build_redirect_deltas(cur, base)
    assert build_security_deltas(cur, base)
    assert build_duplicate_deltas(cur, base)
    assert build_tech_deltas(cur, base)


def test_content_google_seo_health_full_compare() -> None:
    cur = _payload()
    base = _payload(seo_health={"missing_title": 0, "title_ok": 10, "thin_content": 1})
    assert build_content_metrics(cur, base)
    g = build_google_metrics(cur, base)
    assert g["available"] is True
    assert build_seo_health_deltas(cur, base)
    full = build_full_compare(cur, base, current_report_id=2, baseline_report_id=1)
    assert full["health_score"]["delta"] is not None
    assert "issue_deltas" in full


def test_url_set_diff() -> None:
    cur = {"links": [{"url": "https://ex.com/new"}, {"url": "https://ex.com/"}]}
    base = {"links": [{"url": "https://ex.com/"}, {"url": "https://ex.com/old"}]}
    diff = build_url_set_diff(cur, base)
    assert diff["new_count"] >= 1
    assert diff["removed_count"] >= 1
    assert diff["new_urls"][0].startswith("https://")
    assert diff["removed_urls"][0].startswith("https://")
