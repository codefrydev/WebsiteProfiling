"""Tests for issue impact scoring."""
from __future__ import annotations

from website_profiling.reporting.issue_impact import (
    compute_impact_score,
    enrich_categories_with_traffic_impact,
    sort_issues_by_impact,
)


def test_compute_impact_score_weights_clicks():
    assert compute_impact_score("Critical", gsc_clicks=10) > compute_impact_score("Low", gsc_clicks=0)


def test_enrich_and_sort_issues():
    categories = [{
        "issues": [
            {"message": "low", "url": "https://ex.com/a", "priority": "Low"},
            {"message": "high traffic", "url": "https://ex.com/b", "priority": "Medium"},
        ],
    }]
    google = {"gsc": {"pages": [
        {"page": "https://ex.com/b", "clicks": 50, "impressions": 1000},
    ]}}
    enrich_categories_with_traffic_impact(categories, google)
    issues = categories[0]["issues"]
    assert issues[1]["gsc_clicks"] == 50
    assert issues[1]["impact_score"] > issues[0]["impact_score"]
    sorted_issues = sort_issues_by_impact(issues)
    assert sorted_issues[0]["message"] == "high traffic"
