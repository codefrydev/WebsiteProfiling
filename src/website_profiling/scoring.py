"""Shared score rounding helpers."""
from __future__ import annotations

import math
from typing import Any

EXCLUDED = frozenset({"search_performance", "intelligence"})


def round_half_up(value: float) -> int:
    """Round to nearest integer, halves away from zero (not banker's rounding)."""
    return math.floor(value + 0.5)


def site_health_score_from_categories(categories: list[Any] | None) -> int | None:
    scores: list[float] = []
    for cat in categories or []:
        if not isinstance(cat, dict):
            continue
        cat_id = str(cat.get("id") or "")
        score = cat.get("score")
        if not cat_id or cat_id in EXCLUDED or not isinstance(score, (int, float)):
            continue
        scores.append(float(score))
    if not scores:
        return None
    return round_half_up(sum(scores) / len(scores))


def site_health_score_from_payload(report_data: dict[str, Any]) -> int | None:
    summary = report_data.get("summary")
    if isinstance(summary, dict):
        score = summary.get("site_health_score")
        if isinstance(score, (int, float)):
            return round_half_up(float(score))
    top = report_data.get("site_health_score")
    if isinstance(top, (int, float)):
        return round_half_up(float(top))
    categories = report_data.get("categories")
    if isinstance(categories, list):
        return site_health_score_from_categories(categories)
    return None
