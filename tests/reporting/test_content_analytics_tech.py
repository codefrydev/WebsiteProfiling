"""Tests for tech stack summary in content analytics."""
from __future__ import annotations

import pandas as pd

from website_profiling.reporting.content_analytics import _build_tech_stack_summary


def test_build_tech_stack_summary_homepage_and_static_note():
    df = pd.DataFrame([
        {
            "url": "https://codefrydev.in/",
            "status": 200,
            "content_type": "text/html",
            "tech_stack": '["Hugo", "Google Tag Manager"]',
        },
        {
            "url": "https://codefrydev.in/about/",
            "status": 200,
            "content_type": "text/html",
            "tech_stack": '["React"]',
        },
    ])
    summary = _build_tech_stack_summary(
        df,
        start_url="https://codefrydev.in",
        render_mode="static",
    )
    assert summary["total_pages_analyzed"] == 2
    assert summary["homepage_url"] == "https://codefrydev.in/"
    assert [t["name"] for t in summary["homepage_technologies"]] == ["Google Tag Manager", "Hugo"]
    assert summary["detection_notes"] == ["static_crawl"]
    names = {t["name"] for t in summary["technologies"]}
    assert names == {"Google Tag Manager", "Hugo", "React"}


def test_build_tech_stack_summary_auto_render_no_static_note():
    df = pd.DataFrame([
        {
            "url": "https://example.com/",
            "status": 200,
            "content_type": "text/html",
            "tech_stack": '["Next.js"]',
        },
    ])
    summary = _build_tech_stack_summary(df, start_url="https://example.com/", render_mode="auto")
    assert "detection_notes" not in summary
    assert summary["homepage_technologies"][0]["name"] == "Next.js"
