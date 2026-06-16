"""Roadmap issue rules in reporting/categories.py."""
from __future__ import annotations

import pandas as pd

from website_profiling.reporting.categories import (
    _hreflang_issues,
    _indexation_coverage_issues,
    _schema_issues,
    _soft_404_issues,
    _broken_link_sources,
    _orphan_hub_suggestions,
    build_categories,
    category_link_health,
    category_security,
    category_technical_seo,
    merge_indexation_issues,
)


def test_hreflang_missing_self_reference() -> None:
    df = pd.DataFrame([
        {
            "url": "https://example.com/en/",
            "status": "200",
            "page_analysis": '{"hreflang_alternates":[{"hreflang":"en","href":"https://example.com/fr/"}]}',
        },
    ])
    success = df[df["status"].astype(str).str.match(r"2\d{2}")]
    issues = _hreflang_issues(success)
    assert any("self-referencing" in i["message"].lower() for i in issues)


def test_schema_invalid_json_ld() -> None:
    df = pd.DataFrame([
        {
            "url": "https://example.com/page",
            "status": "200",
            "has_schema": True,
            "page_analysis": "{}",
        },
    ])
    success = df[df["status"].astype(str).str.match(r"2\d{2}")]
    issues = _schema_issues(success)
    assert any("json-ld" in i["message"].lower() for i in issues)


def test_soft_404_detected_from_title() -> None:
    df = pd.DataFrame([
        {"url": "https://example.com/missing", "status": "200", "title": "Page Not Found - Example"},
    ])
    success = df[df["status"].astype(str).str.match(r"2\d{2}")]
    issues = _soft_404_issues(success)
    assert len(issues) >= 1


def test_broken_link_sources_lists_inlink_pages() -> None:
    edges = [("https://example.com/a", "https://example.com/broken")]
    issues = _broken_link_sources(edges, {"https://example.com/broken"})
    assert issues and "linked from" in issues[0]["message"].lower()


def test_orphan_hub_suggestion() -> None:
    edges = [
        ("https://example.com/hub", "https://example.com/child"),
        ("https://example.com/hub", "https://example.com/other"),
    ]
    issues = _orphan_hub_suggestions(edges, ["https://example.com/orphan"])
    assert issues and "orphan" in issues[0]["message"].lower()


def test_indexation_sitemap_only_issue() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200", "noindex": False}])
    indexation = {
        "lists": {"sitemap_only": ["https://example.com/missing-page"]},
        "sitemap_urls": ["https://example.com/", "https://example.com/missing-page"],
    }
    issues = _indexation_coverage_issues(df, indexation)
    assert any("not crawled" in i["message"].lower() for i in issues)


def test_category_technical_seo_noindex() -> None:
    df = pd.DataFrame([
        {"url": "https://example.com/x", "status": "200", "title": "X", "noindex": True},
    ])
    cat = category_technical_seo(df, {"robots_present": True, "sitemap_present": True})
    assert cat["id"] == "technical_seo"
    assert any("noindex" in i["message"].lower() for i in cat["issues"])


def test_category_link_health_broken() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200"}])
    broken = [{"url": "https://example.com/404", "status": "404"}]
    cat = category_link_health(df, [], broken, [])
    assert any("broken url" in i["message"].lower() for i in cat["issues"])


def test_category_security_http_start_url() -> None:
    df = pd.DataFrame([{"url": "http://example.com/", "status": "200", "final_url": "http://example.com/"}])
    cat = category_security(df, {}, "http://example.com/", None)
    assert any("https" in i["message"].lower() for i in cat["issues"])


def test_merge_indexation_issues_appends_to_technical_seo() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200"}])
    categories = build_categories(
        df, [], {"issues": {"broken": [], "redirects": []}},
        {"robots_present": True, "sitemap_present": True},
        "https://example.com/",
    )
    indexation = {
        "lists": {"sitemap_only": ["https://example.com/ghost"]},
        "sitemap_urls": ["https://example.com/", "https://example.com/ghost"],
    }
    merge_indexation_issues(categories, df, indexation)
    tech = next(c for c in categories if c["id"] == "technical_seo")
    assert any("not crawled" in i["message"].lower() for i in tech["issues"])


def test_build_categories_accepts_crux_summary() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200", "title": "Home"}])
    crux = {"ok": True, "pass": {"lcp": False, "inp": True, "cls": True}}
    lh = {"median_metrics": {"performance_score": 0.9}, "top_failures": []}
    cats = build_categories(
        df, [], {"issues": {"broken": [], "redirects": []}}, {"robots_present": True, "sitemap_present": True},
        "https://example.com/",
        lighthouse_summary=lh,
        crux_summary=crux,
    )
    cwv = next(c for c in cats if c["id"] == "core_web_vitals")
    assert any("CrUX" in i["message"] for i in cwv["issues"])
