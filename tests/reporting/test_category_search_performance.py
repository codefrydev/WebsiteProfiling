"""Unit tests for the Search performance category (real GSC-driven scoring)."""
from __future__ import annotations

from website_profiling.reporting.categories import category_search_performance


def _daily(values: list[tuple[int, int]]) -> list[dict]:
    """Build a daily series from (clicks, impressions) pairs."""
    return [
        {
            "date": f"2024-01-{i + 1:02d}",
            "clicks": c,
            "impressions": imp,
            "ctr": round(c / imp * 100, 2) if imp else 0.0,
            "position": 5.0,
        }
        for i, (c, imp) in enumerate(values)
    ]


# --- no data --------------------------------------------------------------


def test_none_when_no_gsc() -> None:
    assert category_search_performance(None) is None
    assert category_search_performance({}) is None


def test_none_when_zero_impressions() -> None:
    gsc = {"summary": {"clicks": 0, "impressions": 0, "ctr": 0.0, "position": 0.0}}
    assert category_search_performance(gsc) is None


# --- strong performance: full score, no issues ----------------------------


def test_strong_rankings_scores_100_no_issues() -> None:
    gsc = {
        "summary": {"clicks": 500, "impressions": 1000, "ctr": 50.0, "position": 2.0},
        "top_queries": [
            {"query": "brand", "clicks": 200, "impressions": 300, "ctr": 66.6, "position": 1.4},
        ],
        "top_pages": [],
        "daily": _daily([(5, 100), (5, 100), (5, 100), (20, 200), (20, 200), (20, 200)]),
    }
    cat = category_search_performance(gsc)
    assert cat is not None
    assert cat["id"] == "search_performance"
    assert cat["name"] == "Search performance"
    assert cat["score"] == 100
    assert cat["issues"] == []


# --- poor performance: deductions + issues --------------------------------


def test_poor_rankings_declining_trend_and_striking_distance() -> None:
    gsc = {
        "summary": {"clicks": 5, "impressions": 1000, "ctr": 0.5, "position": 25.0},
        "top_queries": [
            {"query": "q1", "clicks": 0, "impressions": 50, "ctr": 0.0, "position": 15.0},
            {"query": "q2", "clicks": 0, "impressions": 60, "ctr": 0.0, "position": 18.0},
            {"query": "q3", "clicks": 0, "impressions": 30, "ctr": 0.0, "position": 12.0},
            {"query": "q4", "clicks": 0, "impressions": 200, "ctr": 0.0, "position": 30.0},
        ],
        "top_pages": [],
        "daily": _daily([(20, 400), (20, 400), (20, 400), (2, 100), (2, 100), (2, 100)]),
    }
    cat = category_search_performance(gsc)
    assert cat is not None
    assert cat["score"] < 60
    priorities = {i["priority"] for i in cat["issues"]}
    assert "High" in priorities  # avg position > 20 and/or declining clicks
    messages = " ".join(i["message"] for i in cat["issues"]).lower()
    assert "page 2" in messages  # striking-distance queries surfaced
    assert "declining" in messages  # trend signal surfaced
    assert cat["recommendations"]  # recommendations derived from issues


def test_top_position_uses_high_expected_ctr() -> None:
    # Average position <= 1.5 -> ~28% expected CTR; a healthy CTR earns no deduction.
    gsc = {
        "summary": {"clicks": 600, "impressions": 1000, "ctr": 60.0, "position": 1.2},
        "top_queries": [],
        "top_pages": [],
        "daily": [],
    }
    cat = category_search_performance(gsc)
    assert cat is not None
    assert cat["score"] == 100
    assert cat["issues"] == []


def test_position_three_band_low_ctr_flagged() -> None:
    # Average position in (2.5, 3.5] -> ~11% expected CTR; a low CTR is flagged.
    gsc = {
        "summary": {"clicks": 20, "impressions": 1000, "ctr": 2.0, "position": 3.0},
        "top_queries": [],
        "top_pages": [],
        "daily": [],
    }
    cat = category_search_performance(gsc)
    assert cat is not None
    messages = " ".join(i["message"] for i in cat["issues"]).lower()
    assert "click-through rate" in messages
    # position 3.0 is not > 3, so no average-position issue
    assert "average google position" not in messages


def test_mid_position_band_expected_ctr() -> None:
    # Average position in (5, 10] -> ~3% expected CTR band; healthy CTR, no CTR deduction.
    gsc = {
        "summary": {"clicks": 80, "impressions": 1000, "ctr": 8.0, "position": 8.0},
        "top_queries": [],
        "top_pages": [],
        "daily": [],
    }
    cat = category_search_performance(gsc)
    assert cat is not None
    messages = " ".join(i["message"] for i in cat["issues"]).lower()
    assert "click-through rate" not in messages
    assert "average google position is 8.0" in messages  # 4–10 band issue


def test_page2_average_position_and_declining_impressions() -> None:
    # Average position in (10, 20] -> page-2 branch; clicks flat but impressions falling.
    gsc = {
        "summary": {"clicks": 60, "impressions": 1000, "ctr": 6.0, "position": 15.0},
        "top_queries": [],
        "top_pages": [],
        "daily": _daily([(10, 400), (10, 400), (10, 400), (10, 100), (10, 100), (10, 100)]),
    }
    cat = category_search_performance(gsc)
    assert cat is not None
    messages = " ".join(i["message"] for i in cat["issues"]).lower()
    assert "page 2 for many queries" in messages
    assert "impressions are declining" in messages
    assert "clicks are declining" not in messages


def test_striking_distance_ignores_low_impression_queries() -> None:
    gsc = {
        "summary": {"clicks": 50, "impressions": 500, "ctr": 10.0, "position": 4.0},
        "top_queries": [
            # position 11-20 but only a handful of impressions -> not striking
            {"query": "noise", "clicks": 0, "impressions": 3, "ctr": 0.0, "position": 14.0},
        ],
        "top_pages": [],
        "daily": [],
    }
    cat = category_search_performance(gsc)
    assert cat is not None
    messages = " ".join(i["message"] for i in cat["issues"]).lower()
    assert "page 2" not in messages
