"""Tests for scoring helpers."""
from __future__ import annotations

from website_profiling.scoring import (
    round_half_up,
    site_health_score_from_categories,
    site_health_score_from_payload,
)


def test_round_half_up_away_from_bankers_rounding() -> None:
    assert round_half_up(49.5) == 50
    assert round_half_up(50.5) == 51


def test_site_health_score_from_categories_weighted_fixture() -> None:
    categories = [
        {"id": "technical_seo", "score": 80},
        {"id": "link_health", "score": 60},
        {"id": "performance", "score": 70},
        {"id": "security", "score": 90},
        {"id": "core_web_vitals", "score": 50},
        {"id": "mobile", "score": 40},
        {"id": "html_accessibility", "score": 100},
        {"id": "search_performance", "score": 10},
        {"id": "intelligence", "score": 0},
    ]
    assert site_health_score_from_categories(categories) == 70


def test_site_health_score_from_payload_prefers_summary() -> None:
    payload = {
        "summary": {"site_health_score": 72},
        "site_health_score": 65,
        "categories": [{"id": "technical_seo", "score": 10}],
    }
    assert site_health_score_from_payload(payload) == 72
