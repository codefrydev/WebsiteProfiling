"""Focused unit tests for 100% coverage of reporting/categories.py."""
from __future__ import annotations

import json
from unittest.mock import patch

import pandas as pd
import pytest

from website_profiling.reporting.categories import (
    _broken_link_sources,
    _hreflang_issues,
    _indexation_coverage_issues,
    _orphan_hub_suggestions,
    _page_analysis_dict,
    _schema_issues,
    _soft_404_issues,
    build_categories,
    category_core_web_vitals,
    category_core_web_vitals_from_lighthouse,
    category_html_accessibility,
    category_intelligence,
    category_link_health,
    category_mobile,
    category_performance,
    category_security,
    category_technical_seo,
    merge_indexation_issues,
)


# ---------------------------------------------------------------------------
# _page_analysis_dict
# ---------------------------------------------------------------------------


def test_page_analysis_dict_invalid_json() -> None:
    row = pd.Series({"page_analysis": "{not json"})
    assert _page_analysis_dict(row) == {}


def test_page_analysis_dict_non_dict_json() -> None:
    row = pd.Series({"page_analysis": "[1, 2, 3]"})
    assert _page_analysis_dict(row) == {}


def test_page_analysis_dict_nan_and_empty() -> None:
    assert _page_analysis_dict(pd.Series({"page_analysis": None})) == {}
    assert _page_analysis_dict(pd.Series({"page_analysis": float("nan")})) == {}
    assert _page_analysis_dict(pd.Series({"page_analysis": ""})) == {}
    assert _page_analysis_dict(pd.Series({"page_analysis": "{}"})) == {}


# ---------------------------------------------------------------------------
# _hreflang_issues
# ---------------------------------------------------------------------------


def test_hreflang_no_page_analysis_column() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200"}])
    assert _hreflang_issues(df) == []


def test_hreflang_empty_alts_skipped() -> None:
    df = pd.DataFrame([
        {
            "url": "https://example.com/",
            "status": "200",
            "page_analysis": '{"hreflang_alternates":[]}',
        },
    ])
    assert _hreflang_issues(df) == []


def test_hreflang_duplicate_language_codes() -> None:
    df = pd.DataFrame([
        {
            "url": "https://example.com/en/",
            "status": "200",
            "page_analysis": json.dumps({
                "hreflang_alternates": [
                    {"hreflang": "en", "href": "https://example.com/en/"},
                    {"hreflang": "en", "href": "https://example.com/en-alt/"},
                ],
            }),
        },
    ])
    issues = _hreflang_issues(df)
    assert any("duplicate hreflang" in i["message"].lower() for i in issues)


# ---------------------------------------------------------------------------
# _schema_issues
# ---------------------------------------------------------------------------


def test_schema_issues_string_schema_type() -> None:
    df = pd.DataFrame([
        {
            "url": "https://example.com/page",
            "status": "200",
            "has_schema": True,
            "page_analysis": '{"json_ld_types":"Organization"}',
        },
    ])
    issues = _schema_issues(df)
    assert not any("json-ld" in i["message"].lower() for i in issues)


# ---------------------------------------------------------------------------
# _soft_404_issues
# ---------------------------------------------------------------------------


def test_soft_404_breaks_at_ten_issues() -> None:
    rows = [
        {"url": f"https://example.com/missing-{i}", "status": "200", "title": "404 Page Not Found"}
        for i in range(15)
    ]
    issues = _soft_404_issues(pd.DataFrame(rows))
    assert len(issues) == 10


# ---------------------------------------------------------------------------
# _broken_link_sources
# ---------------------------------------------------------------------------


def test_broken_link_sources_empty_broken_set() -> None:
    assert _broken_link_sources([("https://a", "https://b")], set()) == []


def test_broken_link_sources_many_sources_plus_n_more() -> None:
    broken = "https://example.com/broken"
    edges = [(f"https://example.com/src-{i}", broken) for i in range(5)]
    issues = _broken_link_sources(edges, {broken})
    assert len(issues) == 1
    assert "(+2 more)" in issues[0]["message"]


# ---------------------------------------------------------------------------
# _indexation_coverage_issues / merge_indexation_issues
# ---------------------------------------------------------------------------


def test_indexation_coverage_none_indexation() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200"}])
    assert _indexation_coverage_issues(df, None) == []


def test_indexation_coverage_noindex_in_sitemap() -> None:
    df = pd.DataFrame([
        {"url": "https://example.com/hidden", "status": "200", "noindex": True},
    ])
    indexation = {"lists": {}, "sitemap_urls": ["https://example.com/hidden"]}
    issues = _indexation_coverage_issues(df, indexation)
    assert any("noindex" in i["message"].lower() for i in issues)


def test_indexation_coverage_empty_url_skipped() -> None:
    df = pd.DataFrame([
        {"url": "", "status": "200", "noindex": True},
        {"url": "https://example.com/indexed", "status": "200", "noindex": False},
    ])
    indexation = {"lists": {}, "sitemap_urls": ["https://example.com/indexed"]}
    issues = _indexation_coverage_issues(df, indexation)
    assert issues == []


def test_merge_indexation_issues_no_extra_early_return() -> None:
    categories = [{"id": "technical_seo", "issues": [], "recommendations": []}]
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200"}])
    merge_indexation_issues(categories, df, None)
    assert categories[0]["issues"] == []


# ---------------------------------------------------------------------------
# _orphan_hub_suggestions
# ---------------------------------------------------------------------------


def test_orphan_hub_no_edges() -> None:
    assert _orphan_hub_suggestions([], ["https://example.com/orphan"]) == []


def test_orphan_hub_no_orphans() -> None:
    edges = [("https://example.com/hub", "https://example.com/child")]
    assert _orphan_hub_suggestions(edges, []) == []


# ---------------------------------------------------------------------------
# category_technical_seo
# ---------------------------------------------------------------------------


def _success_row(**kwargs: object) -> dict:
    base = {"url": "https://example.com/", "status": "200"}
    base.update(kwargs)
    return base


def test_category_technical_seo_robots_missing() -> None:
    df = pd.DataFrame([_success_row()])
    cat = category_technical_seo(df, {"robots_present": False, "sitemap_present": True})
    assert any("robots.txt" in i["message"].lower() for i in cat["issues"])


def test_category_technical_seo_sitemap_missing() -> None:
    df = pd.DataFrame([_success_row()])
    cat = category_technical_seo(df, {"robots_present": True, "sitemap_present": False})
    assert any("sitemap" in i["message"].lower() for i in cat["issues"])


def test_category_technical_seo_invalid_sitemap() -> None:
    df = pd.DataFrame([_success_row()])
    cat = category_technical_seo(
        df, {"robots_present": True, "sitemap_present": True, "sitemap_valid": False},
    )
    assert any("could not be parsed" in i["message"].lower() for i in cat["issues"])


def test_category_technical_seo_canonical_missing() -> None:
    df = pd.DataFrame([_success_row(url="https://example.com/a", canonical_url="")])
    cat = category_technical_seo(df, {"robots_present": True, "sitemap_present": True})
    assert any("missing canonical" in i["message"].lower() for i in cat["issues"])


def test_category_technical_seo_canonical_skips_nan_url() -> None:
    df = pd.DataFrame([
        _success_row(url=float("nan"), canonical_url=""),
        _success_row(url="https://example.com/ok", canonical_url=""),
    ])
    cat = category_technical_seo(df, {"robots_present": True, "sitemap_present": True})
    assert any("missing canonical" in i["message"].lower() for i in cat["issues"])


def test_category_technical_seo_canonical_mismatch() -> None:
    df = pd.DataFrame([
        _success_row(
            url="https://example.com/page",
            canonical_url="https://example.com/other",
        ),
    ])
    cat = category_technical_seo(df, {"robots_present": True, "sitemap_present": True})
    assert any("canonical points" in i["message"].lower() for i in cat["issues"])


def test_category_technical_seo_duplicate_title_meta() -> None:
    rows = [
        _success_row(url="https://example.com/a", title="Same", meta_description="Same desc"),
        _success_row(url="https://example.com/b", title="Same", meta_description="Same desc"),
    ]
    cat = category_technical_seo(pd.DataFrame(rows), {"robots_present": True, "sitemap_present": True})
    assert any("duplicate content" in i["message"].lower() for i in cat["issues"])


def test_category_technical_seo_og_and_twitter_missing() -> None:
    rows = [_success_row(url=f"https://example.com/{i}", og_title="", twitter_card="") for i in range(4)]
    cat = category_technical_seo(pd.DataFrame(rows), {"robots_present": True, "sitemap_present": True})
    msgs = " ".join(i["message"].lower() for i in cat["issues"])
    assert "open graph" in msgs
    assert "twitter card" in msgs


def test_category_technical_seo_no_schema() -> None:
    df = pd.DataFrame([_success_row(has_schema=False)])
    cat = category_technical_seo(df, {"robots_present": True, "sitemap_present": True})
    assert any("structured data" in i["message"].lower() for i in cat["issues"])


def test_category_technical_seo_html_lang_missing_many_pages() -> None:
    rows = [
        _success_row(
            url=f"https://example.com/{i}",
            page_analysis='{"html_lang":""}' if i < 2 else '{"html_lang":"en"}',
        )
        for i in range(4)
    ]
    cat = category_technical_seo(pd.DataFrame(rows), {"robots_present": True, "sitemap_present": True})
    assert any("<html lang>" in i["message"].lower() for i in cat["issues"])


def test_category_technical_seo_browser_console_and_page_errors() -> None:
    pa_console = json.dumps({
        "browser": {"summary": {"console_error_count": 1, "page_error_count": 0}},
    })
    pa_page_error = json.dumps({
        "browser": {"summary": {"console_error_count": 0, "page_error_count": 2}},
    })
    rows = [
        _success_row(url="https://example.com/console", page_analysis=pa_console),
        _success_row(url="https://example.com/js-error", page_analysis=pa_page_error),
    ]
    cat = category_technical_seo(pd.DataFrame(rows), {"robots_present": True, "sitemap_present": True})
    msgs = " ".join(i["message"].lower() for i in cat["issues"])
    assert "console errors" in msgs
    assert "javascript error" in msgs


def test_category_technical_seo_many_console_errors_high_priority() -> None:
    pa = json.dumps({"browser": {"summary": {"console_error_count": 1, "page_error_count": 0}}})
    rows = [_success_row(url=f"https://example.com/{i}", page_analysis=pa) for i in range(5)]
    cat = category_technical_seo(pd.DataFrame(rows), {"robots_present": True, "sitemap_present": True})
    console_issue = next(i for i in cat["issues"] if "console errors" in i["message"].lower())
    assert console_issue["priority"] == "High"


def test_category_technical_seo_noindex_high_when_many() -> None:
    rows = [_success_row(url=f"https://example.com/{i}", noindex=True) for i in range(6)]
    cat = category_technical_seo(pd.DataFrame(rows), {"robots_present": True, "sitemap_present": True})
    noindex_issue = next(i for i in cat["issues"] if "noindex" in i["message"].lower())
    assert noindex_issue["priority"] == "High"


# ---------------------------------------------------------------------------
# category_core_web_vitals
# ---------------------------------------------------------------------------


def test_category_core_web_vitals_not_measured() -> None:
    cat = category_core_web_vitals()
    assert cat["score"] is None
    assert cat["issues"]


def test_category_core_web_vitals_from_lighthouse_top_failures() -> None:
    lh = {
        "median_metrics": {"performance_score": 0.75},
        "top_failures": [
            {
                "id": "largest-contentful-paint",
                "title": "Largest Contentful Paint",
                "helpText": "LCP too slow",
                "score": 0.3,
                "category": "performance",
            },
            {
                "id": "image-alt",
                "title": "Image elements do not have alt",
                "score": 0.0,
                "category": "accessibility",
            },
            {"id": "", "helpText": "", "score": 0.6},
            {"helpText": "No id failure", "score": 0.8},
        ],
    }
    cat = category_core_web_vitals_from_lighthouse(lh)
    assert len(cat["issues"]) == 1
    assert "Largest Contentful Paint" in cat["issues"][0]["message"]
    assert cat["score"] == 75


def test_category_core_web_vitals_from_lighthouse_uses_title_when_help_missing() -> None:
    from unittest.mock import patch

    lh = {
        "median_metrics": {"performance_score": 0.6},
        "top_failures": [
            "bad",
            {
                "id": "total-blocking-time",
                "title": "Reduce JavaScript execution time",
                "helpText": "",
                "score": 0.4,
                "category": "performance",
            },
            {
                "id": "unknown-cwv-audit",
                "title": "Slow metric",
                "helpText": "",
                "score": 0.2,
                "category": "performance",
            },
        ],
    }
    with patch(
        "website_profiling.reporting.categories.performance._resolve_entry",
        side_effect=[
            {"one_line_fix": "Defer non-critical JavaScript."},
            {},
        ],
    ):
        cat = category_core_web_vitals_from_lighthouse(lh)
    assert len(cat["issues"]) == 2
    assert cat["issues"][0]["message"] == "Reduce JavaScript execution time"
    assert cat["issues"][0]["recommendation"]
    assert cat["issues"][1]["recommendation"] == (
        "See Lighthouse performance recommendations in this audit, or re-run Lighthouse from Run audit."
    )


def test_category_core_web_vitals_from_lighthouse_low_perf_recommendation() -> None:
    lh = {"median_metrics": {"performance_score": 0.5}, "top_failures": []}
    cat = category_core_web_vitals_from_lighthouse(lh)
    assert "Improve Core Web Vitals" in cat["recommendations"][0]


def test_category_core_web_vitals_from_lighthouse_crux_inp_cls_failures() -> None:
    lh = {"median_metrics": {"performance_score": 0.9}, "top_failures": []}
    crux = {"ok": True, "pass": {"lcp": True, "inp": False, "cls": False}}
    cat = category_core_web_vitals_from_lighthouse(lh, crux)
    assert len([i for i in cat["issues"] if "CrUX" in i["message"]]) == 2


def test_build_categories_without_lighthouse() -> None:
    df = pd.DataFrame([_success_row()])
    cats = build_categories(
        df, [], {"issues": {"broken": [], "redirects": []}},
        {"robots_present": True, "sitemap_present": True},
        "https://example.com/",
    )
    cwv = next(c for c in cats if c["id"] == "core_web_vitals")
    assert cwv["score"] is None


# ---------------------------------------------------------------------------
# category_performance
# ---------------------------------------------------------------------------


def test_category_performance_empty_success() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "404"}])
    cat = category_performance(df)
    assert cat["score"] == 0
    assert cat["issues"] == []


def test_category_performance_slow_response_and_p95() -> None:
    rows = [
        {"url": f"https://example.com/{i}", "status": "200", "response_time_ms": 3500}
        for i in range(8)
    ]
    cat = category_performance(pd.DataFrame(rows))
    msgs = " ".join(i["message"].lower() for i in cat["issues"])
    assert "server response time" in msgs
    assert "95th percentile" in msgs


def test_category_performance_lazy_load_img_cache_scripts() -> None:
    rows = [
        {
            "url": f"https://example.com/{i}",
            "status": "200",
            "response_time_ms": 100,
            "images_total": 4,
            "img_without_lazy": 3,
            "img_without_dimensions": 2,
            "cache_control": "",
            "script_count": 15,
        }
        for i in range(2)
    ]
    cat = category_performance(pd.DataFrame(rows))
    msgs = " ".join(i["message"].lower() for i in cat["issues"])
    assert "lazy loading" in msgs
    assert "without width/height" in msgs
    assert "cache-control" in msgs
    assert "script tags" in msgs


# ---------------------------------------------------------------------------
# category_html_accessibility
# ---------------------------------------------------------------------------


def test_category_html_accessibility_empty_success() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "500"}])
    cat = category_html_accessibility(df)
    assert cat["score"] == 0


def test_category_html_accessibility_h1_and_headings() -> None:
    df = pd.DataFrame([
        {
            "url": "https://example.com/zero",
            "status": "200",
            "h1_count": 0,
            "heading_sequence": "h1,h3",
        },
        {
            "url": "https://example.com/multi",
            "status": "200",
            "h1_count": 2,
            "heading_sequence": "",
        },
        {
            "url": "https://example.com/commas",
            "status": "200",
            "h1_count": 1,
            "heading_sequence": ",,,",
        },
    ])
    cat = category_html_accessibility(df)
    msgs = " ".join(i["message"].lower() for i in cat["issues"])
    assert "missing h1" in msgs
    assert "multiple h1" in msgs
    assert "skipped heading" in msgs


def test_category_html_accessibility_alt_thin_reading_level() -> None:
    df = pd.DataFrame([
        {
            "url": "https://example.com/thin",
            "status": "200",
            "h1_count": 1,
            "images_total": 3,
            "images_without_alt": 2,
            "word_count": 50,
            "reading_level": 16,
        },
    ])
    cat = category_html_accessibility(df)
    msgs = " ".join(i["message"].lower() for i in cat["issues"])
    assert "without alt" in msgs
    assert "thin content" in msgs
    assert "reading level" in msgs


def test_category_html_accessibility_score_zero_floor() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "200", "h1_count": 1}])
    with patch(
        "website_profiling.reporting.categories.accessibility._score_deductions",
        return_value=0,
    ):
        cat = category_html_accessibility(df)
    assert cat["score"] == 5


# ---------------------------------------------------------------------------
# category_link_health
# ---------------------------------------------------------------------------


def test_category_link_health_5xx_redirects_chains_orphans() -> None:
    df = pd.DataFrame([
        {"url": "https://example.com/", "status": "200", "redirect_chain_length": 3},
        {"url": "https://example.com/o1", "status": "200"},
        {"url": "https://example.com/o2", "status": "200"},
        {"url": "https://example.com/o3", "status": "200"},
        {"url": "https://example.com/hub", "status": "200"},
    ])
    edges = [("https://example.com/hub", "https://example.com/child")]
    broken = [{"url": "https://example.com/500", "status": "500"}]
    redirects = [{"url": "https://example.com/old", "status": "301", "final_url": "https://example.com/new"}]
    cat = category_link_health(df, edges, broken, redirects)
    msgs = " ".join(i["message"].lower() for i in cat["issues"])
    assert "broken url: 500" in msgs
    assert "redirect:" in msgs
    assert "redirect chains" in msgs
    assert "no internal links" in msgs
    assert "orphan" in msgs


# ---------------------------------------------------------------------------
# category_mobile
# ---------------------------------------------------------------------------


def test_category_mobile_empty_success() -> None:
    df = pd.DataFrame([{"url": "https://example.com/", "status": "404"}])
    cat = category_mobile(df)
    assert cat["score"] == 0


def test_category_mobile_viewport_missing_and_invalid() -> None:
    df = pd.DataFrame([
        {
            "url": "https://example.com/no-vp",
            "status": "200",
            "viewport_present": False,
            "viewport_content": "",
        },
        {
            "url": "https://example.com/bad-vp",
            "status": "200",
            "viewport_present": True,
            "viewport_content": "initial-scale=1",
        },
    ])
    cat = category_mobile(df)
    msgs = " ".join(i["message"].lower() for i in cat["issues"])
    assert "missing viewport" in msgs
    assert "without width or device-width" in msgs


# ---------------------------------------------------------------------------
# category_security
# ---------------------------------------------------------------------------


def test_category_security_headers_mixed_content_findings() -> None:
    df = pd.DataFrame([
        {
            "url": "https://example.com/",
            "status": "200",
            "final_url": "https://example.com/",
            "strict_transport_security": "",
            "x_content_type_options": "",
            "x_frame_options": "",
            "mixed_content_count": 2,
        },
    ])
    findings = [
        {
            "severity": "Critical",
            "message": "SQL injection risk",
            "url": "https://example.com/login",
            "recommendation": "Sanitize inputs",
        },
        {"severity": "Unknown", "message": "Minor issue", "url": "", "recommendation": ""},
    ]
    cat = category_security(df, {}, "https://example.com/", findings)
    msgs = " ".join(i["message"].lower() for i in cat["issues"])
    assert "strict-transport-security" in msgs
    assert "x-content-type-options" in msgs
    assert "x-frame-options" in msgs
    assert "mixed content" in msgs
    assert "sql injection" in msgs


# ---------------------------------------------------------------------------
# category_intelligence
# ---------------------------------------------------------------------------


def test_category_intelligence_big_duplicate_groups() -> None:
    ml = {
        "content_duplicates": [
            {"member_count": 4, "member_urls": ["a", "b", "c", "d"]},
            {"member_count": 3, "member_urls": ["e", "f", "g"]},
        ],
    }
    cat = category_intelligence(ml)
    assert any("3+ urls" in i["message"].lower() for i in cat["issues"])


def test_category_intelligence_small_duplicate_groups() -> None:
    ml = {"content_duplicates": [{"member_count": 2, "member_urls": ["a", "b"]}]}
    cat = category_intelligence(ml)
    assert any("pair/group" in i["message"].lower() for i in cat["issues"])


def test_category_intelligence_mixed_language() -> None:
    ml = {
        "language_summary": {
            "mixed_site": True,
            "detected_pages": 12,
            "counts": {"en": 8, "fr": 4},
        },
    }
    cat = category_intelligence(ml)
    assert any("mixed languages" in i["message"].lower() for i in cat["issues"])


def test_category_intelligence_mixed_language_no_counts() -> None:
    ml = {
        "language_summary": {
            "mixed_site": True,
            "detected_pages": 10,
            "counts": {},
        },
    }
    cat = category_intelligence(ml)
    assert "multiple" in cat["issues"][0]["message"].lower()
