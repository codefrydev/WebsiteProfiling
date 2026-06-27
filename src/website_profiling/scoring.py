"""Shared score rounding helpers."""
from __future__ import annotations

import math
from typing import Any

WEIGHTS: dict[str, float] = {
    "technical_seo": 0.25,
    "link_health": 0.20,
    "performance": 0.15,
    "security": 0.15,
    "core_web_vitals": 0.10,
    "mobile": 0.10,
    "html_accessibility": 0.05,
}

EXCLUDED = frozenset({"search_performance", "intelligence"})


def round_half_up(value: float) -> int:
    """Round to nearest integer, halves away from zero (not banker's rounding)."""
    return math.floor(value + 0.5)


def site_health_score_from_categories(categories: list[Any] | None) -> int | None:
    weighted_sum = 0.0
    weight_total = 0.0
    by_id: dict[str, float] = {}
    for cat in categories or []:
        if not isinstance(cat, dict):
            continue
        cat_id = str(cat.get("id") or "")
        score = cat.get("score")
        if not cat_id or cat_id in EXCLUDED or not isinstance(score, (int, float)):
            continue
        by_id[cat_id] = float(score)
    for cat_id, weight in WEIGHTS.items():
        score = by_id.get(cat_id)
        if score is None:
            continue
        weighted_sum += score * weight
        weight_total += weight
    if weight_total <= 0:
        return None
    return round_half_up(weighted_sum / weight_total)


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
