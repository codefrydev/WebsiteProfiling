"""Tests for accessibility contrast issue detection."""
from __future__ import annotations

import json

import pandas as pd

from website_profiling.reporting.categories import (
    category_html_accessibility,
    contrast_issues_from_sources,
)


def test_contrast_from_axe_violations():
    pa = {
        "axe_violations": [
            {
                "id": "color-contrast",
                "description": "Elements must have sufficient color contrast",
                "help": "Fix contrast",
            }
        ]
    }
    df = pd.DataFrame([
        {
            "url": "https://ex.com/page",
            "status": "200",
            "page_analysis": json.dumps(pa),
            "h1_count": 1,
            "images_total": 0,
            "images_without_alt": 0,
        }
    ])
    issues = contrast_issues_from_sources(df, {})
    assert len(issues) == 1
    assert "axe" in issues[0]["message"].lower()
    assert issues[0]["url"] == "https://ex.com/page"


def test_lighthouse_accessibility_issues_from_summary():
    from website_profiling.reporting.categories.accessibility import (
        lighthouse_accessibility_issues_from_summary,
    )

    lh = {
        "top_failures": [
            {
                "id": "image-alt",
                "title": "Image elements do not have `[alt]` attributes",
                "description": "Informative elements should aim for short, descriptive alternate text.",
                "score": 0,
                "category": "accessibility",
            },
            {
                "id": "largest-contentful-paint",
                "title": "LCP slow",
                "score": 0.3,
                "category": "performance",
            },
        ],
    }
    issues = lighthouse_accessibility_issues_from_summary(lh)
    assert len(issues) == 1
    assert "Image elements" in issues[0]["message"]
    assert "alt" in issues[0]["recommendation"].lower()


def test_contrast_from_lighthouse_failures():
    df = pd.DataFrame([
        {"url": "https://ex.com/a", "status": "200", "h1_count": 1, "images_total": 0, "images_without_alt": 0},
    ])
    lh = {
        "https://ex.com/a": {
            "url": "https://ex.com/a",
            "top_failures": [{"id": "color-contrast", "helpText": "Background and foreground colors do not contrast"}],
        }
    }
    issues = contrast_issues_from_sources(df, lh)
    assert len(issues) == 1
    assert "Lighthouse" in issues[0]["message"]


def test_category_omits_stub_when_contrast_data_exists():
    pa = {"axe_violations": [{"id": "color-contrast", "description": "bad contrast", "help": "fix"}]}
    df = pd.DataFrame([
        {
            "url": "https://ex.com/",
            "status": "200",
            "page_analysis": json.dumps(pa),
            "h1_count": 1,
            "images_total": 0,
            "images_without_alt": 0,
            "word_count": 200,
            "reading_level": 8,
        }
    ])
    cat = category_html_accessibility(df)
    messages = [i["message"] for i in cat["issues"]]
    assert not any("not measured" in m for m in messages)
    assert any("axe" in m.lower() for m in messages)


def test_contrast_skips_non_matching_axe_and_lighthouse_rows():
    df = pd.DataFrame([
        {
            "url": "",
            "status": "200",
            "page_analysis": json.dumps({"axe_violations": [{"id": "label", "description": "x"}]}),
        },
        {
            "url": "https://ex.com/b",
            "status": "200",
            "page_analysis": json.dumps({"axe_violations": [{"id": "label"}]}),
        },
    ])
    lh = {
        "https://ex.com/a": "not-a-dict",
        "https://ex.com/b": {
            "top_failures": [
                "bad",
                {"id": "image-alt", "helpText": "missing alt"},
            ],
        },
    }
    assert contrast_issues_from_sources(df, lh) == [
        {
            "message": "Lighthouse: Image Alt: missing alt",
            "url": "https://ex.com/b",
            "priority": "High",
            "recommendation": 'Add alt attribute to <img> (use alt="" for decorative images).',
        }
    ]


def test_contrast_deduplicates_lighthouse_when_axe_already_reported():
    pa = {"axe_violations": [{"id": "color-contrast", "description": "axe contrast", "help": "fix"}]}
    df = pd.DataFrame([
        {"url": "https://ex.com/shared", "status": "200", "page_analysis": json.dumps(pa)},
    ])
    lh = {
        "https://ex.com/shared": {
            "top_failures": [{"id": "color-contrast", "helpText": "lh contrast"}],
        }
    }
    issues = contrast_issues_from_sources(df, lh)
    assert len(issues) == 1
    assert "axe" in issues[0]["message"].lower()


def test_contrast_accepts_dict_page_analysis_cell():
    df = pd.DataFrame([
        {
            "url": "https://ex.com/dict",
            "status": "200",
            "page_analysis": {"axe_violations": [{"id": "color-contrast", "description": "low contrast"}]},
        },
        {
            "url": "https://ex.com/bad-json",
            "status": "200",
            "page_analysis": "{not-json",
        },
    ])
    issues = contrast_issues_from_sources(df, {})
    assert len(issues) == 1
    assert issues[0]["url"] == "https://ex.com/dict"


def test_lighthouse_accessibility_issues_from_sources_branches() -> None:
    from unittest.mock import patch

    from website_profiling.reporting.categories.accessibility import (
        lighthouse_accessibility_issues_from_sources,
    )

    lh = {
        "": {"top_failures": [{"id": "image-alt", "category": "accessibility"}]},
        "https://ex.com/skip-contrast": {
            "top_failures": [{"id": "color-contrast", "category": "accessibility"}],
        },
        "https://ex.com/perf-only": {
            "top_failures": [{"id": "largest-contentful-paint", "category": "performance"}],
        },
        "https://ex.com/impact-gate": {
            "top_failures": [{"id": "custom-audit", "title": "Custom", "impact": "Performance"}],
        },
        "https://ex.com/dup": {
            "top_failures": [
                {"id": "image-alt", "category": "accessibility"},
                {"id": "image-alt", "category": "accessibility"},
            ],
        },
        "https://ex.com/empty-aid": {
            "top_failures": [{"id": "", "category": "accessibility"}],
        },
        "https://ex.com/default-rec": {
            "top_failures": [{"id": "unknown-audit-id", "category": "accessibility", "title": ""}],
        },
    }
    with patch(
        "website_profiling.reporting.categories.accessibility._resolve_entry",
        return_value={"severity": "Medium"},
    ):
        issues = lighthouse_accessibility_issues_from_sources(
            lh,
            skip_lh_contrast_urls={"https://ex.com/skip-contrast"},
        )
    urls = {i["url"] for i in issues}
    assert "https://ex.com/skip-contrast" not in urls
    assert "https://ex.com/perf-only" not in urls
    assert "https://ex.com/impact-gate" not in urls
    assert "https://ex.com/dup" in urls
    assert len([i for i in issues if i["url"] == "https://ex.com/dup"]) == 1
    assert any(
        i["recommendation"] == "See Lighthouse accessibility recommendations for this page."
        for i in issues
    )


def test_lighthouse_accessibility_issues_from_summary_branches() -> None:
    from unittest.mock import patch

    from website_profiling.reporting.categories.accessibility import (
        lighthouse_accessibility_issues_from_summary,
    )

    lh = {
        "top_failures": [
            "bad",
            {"id": "", "category": "accessibility"},
            {"id": "image-alt", "category": "performance"},
            {"id": "custom-audit", "title": "Custom", "impact": "Performance"},
            {"id": "unknown-audit-id", "category": "accessibility", "title": ""},
        ],
    }
    with patch(
        "website_profiling.reporting.categories.accessibility._resolve_entry",
        return_value={},
    ):
        issues = lighthouse_accessibility_issues_from_summary(lh)
    assert len(issues) == 1
    assert issues[0]["recommendation"] == "See Lighthouse accessibility recommendations."


def test_category_merges_lighthouse_summary_accessibility_issues() -> None:
    pa = {"axe_violations": [{"id": "color-contrast", "description": "bad contrast", "help": "fix"}]}
    df = pd.DataFrame([
        {
            "url": "https://ex.com/",
            "status": "200",
            "page_analysis": json.dumps(pa),
            "h1_count": 1,
            "images_total": 0,
            "images_without_alt": 0,
            "word_count": 200,
            "reading_level": 8,
        }
    ])
    lh_summary = {
        "top_failures": [
            {"id": "image-alt", "title": "Images need alt text", "category": "accessibility"},
        ],
    }
    cat = category_html_accessibility(df, lighthouse_summary=lh_summary)
    messages = [i["message"] for i in cat["issues"]]
    assert any("axe" in m.lower() for m in messages)
    assert any("Lighthouse" in m for m in messages)


def test_category_keeps_stub_without_contrast_data():
    df = pd.DataFrame([
        {
            "url": "https://ex.com/",
            "status": "200",
            "page_analysis": "{}",
            "h1_count": 1,
            "images_total": 0,
            "images_without_alt": 0,
            "word_count": 200,
            "reading_level": 8,
        }
    ])
    cat = category_html_accessibility(df)
    assert any("not measured" in i["message"] for i in cat["issues"])
