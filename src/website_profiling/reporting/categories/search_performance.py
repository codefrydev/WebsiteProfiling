"""Report category: search_performance.

Scored from real Google Search Console data (average position, CTR, query
distribution, click/impression trend) — unlike the other categories, this one
reflects how the site actually performs in Google, not internal audit heuristics.

Returns ``None`` when GSC data is unavailable (Google not connected, or the
property has no search impressions in the window) so the builder can skip it and
the headline Site-health average stays internal-only.
"""
from __future__ import annotations

from typing import Any, Optional

from ._helpers import (
    _issue,
    _score_deductions,
    _sort_issues,
)
from ..terminology import CATEGORY_SEARCH_PERFORMANCE

# Minimum impressions before a CTR / zero-click signal is meaningful (low-volume
# queries have noisy CTR and shouldn't drive deductions).
_MIN_IMPRESSIONS_FOR_CTR = 100
_STRIKING_MIN_IMPRESSIONS = 10
# Need at least this many daily points to split the window into halves for a trend.
_TREND_MIN_DAYS = 6
# A half-over-half drop below this ratio counts as a decline.
_DECLINE_RATIO = 0.8


def _expected_ctr(position: float) -> float:
    """Rough organic CTR (percent) for an average position. Lower rank → less CTR."""
    if position <= 1.5:
        return 28.0
    if position <= 2.5:
        return 15.0
    if position <= 3.5:
        return 11.0
    if position <= 5.0:
        return 7.0
    if position <= 10.0:
        return 3.0
    return 1.0


def category_search_performance(gsc: Optional[dict[str, Any]]) -> Optional[dict]:
    """Score real Google Search Console performance, or ``None`` if no GSC data."""
    if not gsc or not isinstance(gsc, dict):
        return None
    summary = gsc.get("summary") or {}
    impressions = float(summary.get("impressions") or 0)
    if impressions <= 0:
        return None

    position = float(summary.get("position") or 0)
    ctr = float(summary.get("ctr") or 0)  # percent (0–100)
    top_queries = gsc.get("top_queries") or []
    daily = gsc.get("daily") or []

    issues: list[dict] = []
    deductions: list[tuple[int, bool]] = []

    # --- Average position: the headline ranking signal (1 = best) -------------
    if position > 0:
        if position > 20:
            issues.append(_issue(
                f"Average Google position is {position:.1f} — most queries rank beyond page 2.",
                priority="High",
                recommendation="Strengthen on-page relevance, internal linking, and content depth for target queries.",
            ))
            deductions.append((35, True))
        elif position > 10:
            issues.append(_issue(
                f"Average Google position is {position:.1f} — ranking on page 2 for many queries.",
                priority="High",
                recommendation="Improve on-page optimisation and internal links to push key queries onto page 1.",
            ))
            deductions.append((20, True))
        elif position > 3:
            issues.append(_issue(
                f"Average Google position is {position:.1f} — room to reach the top 3.",
                priority="Medium",
                recommendation="Refine titles, content, and internal links for queries ranking 4–10.",
            ))
            deductions.append((8, True))

    # --- CTR vs. expected for the average position ----------------------------
    if impressions >= _MIN_IMPRESSIONS_FOR_CTR and position > 0:
        expected = _expected_ctr(position)
        if ctr < expected * 0.6:
            issues.append(_issue(
                f"Click-through rate ({ctr:.1f}%) is below the ~{expected:.0f}% typical for "
                f"average position {position:.1f}.",
                priority="Medium",
                recommendation="Improve titles and meta descriptions, and add structured data for richer SERP snippets.",
            ))
            deductions.append((10, True))

    # --- Striking-distance queries (page 2: positions 11–20) ------------------
    striking = [
        q for q in top_queries
        if isinstance(q, dict)
        and 10 < float(q.get("position") or 0) <= 20
        and float(q.get("impressions") or 0) >= _STRIKING_MIN_IMPRESSIONS
    ]
    if striking:
        sample = ", ".join(str(q.get("query") or "") for q in striking[:3] if q.get("query"))
        more = f" (+{len(striking) - 3} more)" if len(striking) > 3 else ""
        issues.append(_issue(
            f"{len(striking)} quer(y/ies) rank on page 2 (positions 11–20): {sample}{more}.",
            priority="Medium",
            recommendation="These are close to page 1 — add internal links and refresh content to push them up.",
        ))
        deductions.append((min(10, len(striking)), True))

    # --- Zero-click, high-impression queries ---------------------------------
    zero_click = [
        q for q in top_queries
        if isinstance(q, dict)
        and float(q.get("impressions") or 0) >= _MIN_IMPRESSIONS_FOR_CTR
        and float(q.get("clicks") or 0) == 0
    ]
    if zero_click:
        sample = ", ".join(str(q.get("query") or "") for q in zero_click[:3] if q.get("query"))
        more = f" (+{len(zero_click) - 3} more)" if len(zero_click) > 3 else ""
        issues.append(_issue(
            f"{len(zero_click)} quer(y/ies) get impressions but no clicks: {sample}{more}.",
            priority="Medium",
            recommendation="Review search intent match and rewrite titles/descriptions to earn the click.",
        ))
        deductions.append((min(8, len(zero_click)), True))

    # --- Click / impression trend (first vs. second half of the window) ------
    if len(daily) >= _TREND_MIN_DAYS:
        mid = len(daily) // 2
        first, second = daily[:mid], daily[mid:]
        first_clicks = sum(float(d.get("clicks") or 0) for d in first)
        second_clicks = sum(float(d.get("clicks") or 0) for d in second)
        first_impr = sum(float(d.get("impressions") or 0) for d in first)
        second_impr = sum(float(d.get("impressions") or 0) for d in second)
        if first_clicks > 0 and second_clicks < first_clicks * _DECLINE_RATIO:
            issues.append(_issue(
                "Search clicks are declining over the reporting window.",
                priority="High",
                recommendation="Investigate ranking losses or seasonality; refresh affected pages.",
            ))
            deductions.append((12, True))
        elif first_impr > 0 and second_impr < first_impr * _DECLINE_RATIO:
            issues.append(_issue(
                "Search impressions are declining over the reporting window.",
                priority="Medium",
                recommendation="Check for indexing or visibility losses; expand and refresh content.",
            ))
            deductions.append((8, True))

    score = _score_deductions(100, deductions)
    return {
        "id": "search_performance",
        "name": CATEGORY_SEARCH_PERFORMANCE,
        "score": int(score),
        "issues": _sort_issues(issues),
        "recommendations": list({i["recommendation"] for i in issues if i["recommendation"]}),
    }
