"""Attach GSC/GA4 traffic signals and impact scores to audit issues."""
from __future__ import annotations

from typing import Any

PRIORITY_WEIGHT = {"Critical": 1000, "High": 100, "Medium": 10, "Low": 1}


def _metrics_by_url(google_data: dict[str, Any] | None) -> tuple[dict[str, dict], dict[str, dict]]:
    clicks: dict[str, dict] = {}
    sessions: dict[str, dict] = {}
    if not google_data or not isinstance(google_data, dict):
        return clicks, sessions
    gsc = google_data.get("gsc") or {}
    if isinstance(gsc, dict):
        for row in (gsc.get("top_pages") or []):
            if not isinstance(row, dict):
                continue
            url = str(row.get("page") or "").strip().lower()
            if not url:
                continue
            clicks[url] = {
                "gsc_clicks": float(row.get("clicks") or 0),
                "gsc_impressions": float(row.get("impressions") or 0),
            }
    ga4 = google_data.get("ga4") or {}
    if isinstance(ga4, dict):
        for row in (ga4.get("top_pages") or []):
            if not isinstance(row, dict):
                continue
            path = str(row.get("path") or "").strip().lower()
            if not path:
                continue
            sessions[path] = {"ga4_sessions": float(row.get("sessions") or 0)}
    return clicks, sessions


def compute_impact_score(
    priority: str,
    *,
    gsc_clicks: float = 0,
    ga4_sessions: float = 0,
) -> float:
    base = PRIORITY_WEIGHT.get(priority, 1)
    return round(base + gsc_clicks * 10.0 + ga4_sessions * 5.0, 2)


def enrich_categories_with_traffic_impact(
    categories: list[dict[str, Any]],
    google_data: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    """Mutates issue dicts in categories with traffic fields and impact_score."""
    clicks_by_url, sessions_by_path = _metrics_by_url(google_data)
    for cat in categories or []:
        if not isinstance(cat, dict):
            continue
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            url = str(issue.get("url") or "").strip().lower()
            gsc = clicks_by_url.get(url, {})
            ga4_sess = 0.0
            if url:
                for path_key, ga in sessions_by_path.items():
                    key = path_key
                    # Skip the homepage "/" key, which would make url.endswith("/") match every issue.
                    if key in ("/", ""):
                        continue
                    if url.endswith(key):
                        ga4_sess = max(ga4_sess, float(ga.get("ga4_sessions") or 0))
            issue["gsc_clicks"] = gsc.get("gsc_clicks", 0)
            issue["gsc_impressions"] = gsc.get("gsc_impressions", 0)
            issue["ga4_sessions"] = ga4_sess
            issue["impact_score"] = compute_impact_score(
                str(issue.get("priority") or "Medium"),
                gsc_clicks=float(issue.get("gsc_clicks") or 0),
                ga4_sessions=ga4_sess,
            )
    return categories


def sort_issues_by_impact(issues: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        issues,
        key=lambda i: (
            -float(i.get("impact_score") or 0),
            -PRIORITY_WEIGHT.get(str(i.get("priority") or "Low"), 0),
        ),
    )
