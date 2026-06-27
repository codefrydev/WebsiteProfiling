"""Tests for reporting/compare_payload.py — parity with web compare."""
from __future__ import annotations

from unittest.mock import patch

from website_profiling.reporting.compare_payload import (
    build_category_scores,
    build_content_metrics,
    build_duplicate_deltas,
    build_full_compare,
    build_google_metrics,
    build_indexation_deltas,
    build_issue_deltas,
    build_lighthouse_url_deltas,
    build_link_metric_deltas,
    build_orphan_deltas,
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
            "https://ex.com/slow": {"performance": 40, "median_metrics": {"performance_score": 0.40, "seo_score": 0.80}},
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
    assert norm_report_url("https://Ex.COM/page/") == "ex.com/page/"
    assert norm_report_url("") == ""
    assert norm_report_url("  ") == ""
    assert norm_report_url("relative/path/") == "relative/path/"
    with patch("website_profiling.reporting.compare_payload.urlparse", side_effect=ValueError("bad")):
        assert norm_report_url("https://ex.com/x") == "https://ex.com/x"


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
        lighthouse_by_url={"https://ex.com/slow": {"performance": 90, "median_metrics": {"performance_score": 0.90}}},
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
    assert build_url_set_diff({"links": ["not-a-dict"]}, {}) == {
        "new_urls": [],
        "removed_urls": [],
        "new_count": 0,
        "removed_count": 0,
    }


def test_issue_deltas_edge_cases() -> None:
    cur = {
        "categories": [
            "skip",
            {"name": "SEO", "issues": [
                "skip",
                {"url": "", "message": ""},
                {"url": "https://ex.com/a", "message": "Fix", "priority": "Critical"},
            ]},
        ],
    }
    base = {
        "categories": [
            {"name": "SEO", "issues": [
                {"url": "https://ex.com/b", "message": "Gone", "priority": "Low"},
            ]},
        ],
    }
    issues = build_issue_deltas(cur, base)
    kinds = {i["kind"] for i in issues}
    assert "new" in kinds
    assert "resolved" in kinds


def test_priority_counts_skips_invalid_entries() -> None:
    cur = {"categories": ["skip", {"issues": ["skip", {"priority": "High"}]}]}
    base = {"categories": []}
    counts = build_priority_counts(cur, base)
    assert counts[1]["current"] == 1


def test_lighthouse_uses_summary_scores_when_median_missing() -> None:
    cur = {
        "lighthouse_by_url": {
            "https://ex.com/a": {"performance": 80, "seo": 75},
        },
        "links": [],
    }
    base = {
        "lighthouse_by_url": {
            "https://ex.com/a": {"performance": 60, "seo": 70},
        },
        "links": [],
    }
    deltas = build_lighthouse_url_deltas(cur, base)
    assert len(deltas) == 1
    assert deltas[0]["performance_current"] == 80
    assert deltas[0]["performance_baseline"] == 60
    assert deltas[0]["performance_delta"] == 20


def test_lighthouse_from_links_and_skips() -> None:
    cur = {
        "lighthouse_by_url": {
            "": {"performance": 50},
            "https://ex.com/a": "skip",
        },
        "links": [
            {"url": "https://ex.com/b", "lighthouse": {"median_metrics": {"performance_score": 0.70, "seo_score": 0.90}}},
            "skip",
            {"url": "https://ex.com/a", "lighthouse": {"median_metrics": {"performance_score": 0.80}}},
        ],
    }
    base = {"lighthouse_by_url": {"https://ex.com/c": {"median_metrics": {"performance_score": 0.50, "seo_score": 0.50}}}}
    assert build_lighthouse_url_deltas(cur, base) == []


def test_link_metric_deltas_edge_cases() -> None:
    cur = {"links": [{"url": "https://ex.com/a", "inlinks": 10, "outlinks": 5}]}
    base = {
        "links": [
            "skip",
            {"url": ""},
            {"url": "https://ex.com/missing"},
            {"url": "https://ex.com/a", "inlinks": 5, "outlinks": 5, "word_count": "x"},
            {"url": "https://ex.com/b", "inlinks": 1, "outlinks": 1},
        ],
    }
    deltas = build_link_metric_deltas(cur, base)
    assert len(deltas) == 1
    assert deltas[0]["metric"] == "inlinks"
    assert build_link_metric_deltas({"links": []}, {"links": []}) == []


def test_redirect_deltas_removed_and_skips() -> None:
    cur = {"redirects": ["skip", {"url": "", "from": ""}]}
    base = {"redirects": [{"url": "https://ex.com/gone", "status": "301"}]}
    deltas = build_redirect_deltas(cur, base)
    assert any(d["kind"] == "removed" for d in deltas)


def test_security_deltas_resolved_and_skips() -> None:
    cur = {"security_findings": []}
    base = {
        "security_findings": [
            "skip",
            {"url": "https://ex.com", "finding_type": "csp", "message": "missing"},
        ],
    }
    deltas = build_security_deltas(cur, base)
    assert len(deltas) == 1
    assert deltas[0]["kind"] == "resolved"


def test_duplicate_deltas_all_kinds() -> None:
    cur = {
        "content_duplicates": [
            "skip",
            {"representative_url": ""},
            {"id": "new1", "representative_url": "https://ex.com/n", "member_count": 3},
            {"id": "chg", "representative_url": "https://ex.com/c", "member_urls": ["a", "b", "c"]},
        ],
    }
    base = {
        "content_duplicates": [
            {"id": "chg", "representative_url": "https://ex.com/c", "member_count": 2},
            {"id": "rm", "representative_url": "https://ex.com/r", "member_count": 4},
        ],
    }
    deltas = build_duplicate_deltas(cur, base)
    kinds = {d["kind"] for d in deltas}
    assert kinds == {"new", "changed", "removed"}


def test_tech_deltas_removed_and_skips() -> None:
    cur = {"tech_stack_summary": {"technologies": ["skip", {"name": "React", "count": 2}]}}
    base = {"tech_stack_summary": {"technologies": [{"name": "jQuery", "count": 1}]}}
    deltas = build_tech_deltas(cur, base)
    kinds = {d["kind"] for d in deltas}
    assert kinds == {"added", "removed"}


def test_google_metrics_unavailable() -> None:
    assert build_google_metrics({}, {}) == {"available": False, "metrics": []}


def test_category_scores_skips_invalid() -> None:
    cur = {"categories": ["skip", {"id": "", "score": 90}, {"id": "perf", "name": "Performance", "score": 75}]}
    base = {"categories": [{"id": "perf", "score": 80}]}
    scores = build_category_scores(cur, base)
    assert len(scores) == 1
    assert scores[0]["id"] == "perf"
    assert scores[0]["delta"] == -5


def test_indexation_and_orphan_deltas() -> None:
    cur = {
        "indexation_coverage": {
            "counts": {"crawled": 12, "sitemap": 10},
            "lists": {
                "sitemap_only": ["https://ex.com/new-gap"],
                "crawled_not_in_sitemap": [],
                "gsc_not_crawled": ["https://ex.com/gsc-only"],
            },
        },
        "orphan_urls": ["https://ex.com/orphan-a", "https://ex.com/orphan-b"],
    }
    base = {
        "indexation_coverage": {
            "counts": {"crawled": 10, "gsc": 8},
            "lists": {
                "sitemap_only": ["https://ex.com/old-gap"],
                "crawled_not_in_sitemap": ["https://ex.com/crawl-gap"],
                "gsc_not_crawled": [],
            },
        },
        "orphan_urls": ["https://ex.com/orphan-a"],
    }
    idx = build_indexation_deltas(cur, base)
    assert any(d["metric"] == "crawled" and d["delta"] == 2 for d in idx["count_deltas"])
    assert idx["gap_deltas"]["sitemap_only"]["added_count"] >= 1
    assert idx["gap_deltas"]["crawled_not_in_sitemap"]["removed_count"] >= 1

    orphans = build_orphan_deltas(cur, base)
    assert orphans["added_count"] == 1
    assert orphans["removed_count"] == 0
    assert orphans["delta"] == 1

    empty = build_orphan_deltas({"orphan_urls": "not-a-list"}, {})
    assert empty["current_count"] == 0

    bad_counts = build_indexation_deltas(
        {"indexation_coverage": {"counts": {"crawled": "many"}, "lists": {}}},
        {"indexation_coverage": {"counts": {"crawled": "few"}, "lists": {}}},
    )
    assert bad_counts["count_deltas"][0]["delta"] is None


def test_full_compare_truncation() -> None:
    many_issues = [
        {"priority": "Low", "message": f"issue-{i}", "url": f"https://ex.com/p{i}"}
        for i in range(105)
    ]
    cur = {"categories": [{"id": "x", "name": "X", "score": 50, "issues": many_issues}]}
    base = {"categories": []}
    full = build_full_compare(cur, base)
    assert full["truncated_sections"].get("issue_deltas") is True
    assert len(full["issue_deltas"]) == 100

    links = []
    for i in range(210):
        links.append({
            "url": f"https://ex.com/l{i}",
            "inlinks": i + 10,
            "outlinks": 1,
            "word_count": 100,
            "response_time_ms": 100,
        })
    cur_links = {"links": links}
    base_links = {
        "links": [
            {
                "url": f"https://ex.com/l{i}",
                "inlinks": i,
                "outlinks": 1,
                "word_count": 100,
                "response_time_ms": 100,
            }
            for i in range(210)
        ],
    }
    full_links = build_full_compare(cur_links, base_links)
    assert full_links["truncated_sections"].get("link_metric_deltas") is True
    assert len(full_links["link_metric_deltas"]) == 200
