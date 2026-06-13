"""Shared helpers for cross-platform GSC + GA4 + audit insight tools."""
from __future__ import annotations

from typing import Any

from ...integrations.google.normalize import normalize_url, url_to_path


def provenance_block(
    sources: list[str],
    fetched_at: str | None = None,
    *,
    confidence: str = "high",
) -> dict[str, Any]:
    return {
        "sources": sources,
        "fetched_at": fetched_at,
        "confidence": confidence,
    }


def _num(val: Any, default: float = 0.0) -> float:
    try:
        if val is None:
            return default
        return float(val)
    except (TypeError, ValueError):
        return default


def classify_opportunity_quadrant(
    gsc_row: dict[str, Any] | None,
    ga4_row: dict[str, Any] | None,
    *,
    site_median_sessions: float = 0.0,
) -> str:
    position = _num((gsc_row or {}).get("position"), 99)
    impressions = _num((gsc_row or {}).get("impressions"))
    sessions = _num((ga4_row or {}).get("sessions"))
    engagement = _num((ga4_row or {}).get("engagementRate"))

    rank_potential = impressions >= 100 and 4 <= position <= 20
    convert_potential = sessions >= max(site_median_sessions * 0.5, 5) or engagement >= 0.5

    if rank_potential and convert_potential:
        return "high_impact"
    if rank_potential:
        return "worth_optimizing"
    if convert_potential:
        return "good_but_capped"
    return "low_priority"


def traffic_health_ratio(
    gsc_summary: dict[str, Any] | None,
    ga4_summary: dict[str, Any] | None,
) -> dict[str, Any]:
    clicks = _num((gsc_summary or {}).get("clicks"))
    sessions = _num((ga4_summary or {}).get("sessions"))
    if clicks <= 0 and sessions <= 0:
        return {
            "gsc_clicks": clicks,
            "ga4_sessions": sessions,
            "ratio": None,
            "diagnosis": "no_data",
            "note": "Connect GSC and GA4 and re-run the pipeline.",
        }
    ratio = sessions / clicks if clicks > 0 else None
    diagnosis = "healthy"
    note = "GSC clicks and GA4 sessions are in a plausible range."
    if ratio is not None:
        if ratio < 0.3:
            diagnosis = "tracking_gap"
            note = "GA4 sessions are much lower than GSC clicks — check filters, consent mode, or landing page tagging."
        elif ratio > 3.0:
            diagnosis = "filter_issue"
            note = "GA4 sessions exceed GSC clicks — GA4 may include non-organic traffic or GSC date range differs."
    return {
        "gsc_clicks": clicks,
        "ga4_sessions": sessions,
        "ratio": round(ratio, 3) if ratio is not None else None,
        "diagnosis": diagnosis,
        "note": note,
    }


def blend_landing_pages(
    gsc_by_page: dict[str, Any],
    ga4_by_path: dict[str, Any],
    *,
    limit: int = 50,
    min_impressions: int = 0,
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    ga4_by_norm: dict[str, dict[str, Any]] = {}
    for path, val in (ga4_by_path or {}).items():
        if not isinstance(val, dict):
            continue
        full = str(val.get("full_url") or path)
        ga4_by_norm[normalize_url(full)] = val
        ga4_by_norm[normalize_url(str(path))] = val

    session_vals = [_num(v.get("sessions")) for v in ga4_by_norm.values() if isinstance(v, dict)]
    session_vals.sort()
    median_sessions = session_vals[len(session_vals) // 2] if session_vals else 0.0

    for page_url, gsc_row in (gsc_by_page or {}).items():
        if not isinstance(gsc_row, dict):
            continue
        impressions = _num(gsc_row.get("impressions"))
        if impressions < min_impressions:
            continue
        norm = normalize_url(str(page_url))
        ga4_row = ga4_by_norm.get(norm)
        if ga4_row is None:
            path = url_to_path(str(page_url))
            ga4_row = ga4_by_norm.get(normalize_url(path))
        quadrant = classify_opportunity_quadrant(
            gsc_row, ga4_row if isinstance(ga4_row, dict) else None,
            site_median_sessions=median_sessions,
        )
        rows.append({
            "url": page_url,
            "gsc_clicks": int(_num(gsc_row.get("clicks"))),
            "gsc_impressions": int(impressions),
            "gsc_position": round(_num(gsc_row.get("position")), 1),
            "gsc_ctr": round(_num(gsc_row.get("ctr")), 4),
            "ga4_sessions": int(_num((ga4_row or {}).get("sessions"))) if ga4_row else 0,
            "ga4_engagement_rate": round(_num((ga4_row or {}).get("engagementRate")), 3) if ga4_row else None,
            "quadrant": quadrant,
        })

    rows.sort(key=lambda r: (-r["gsc_clicks"], -r["gsc_impressions"]))
    return rows[: max(1, min(limit, 100))]


def page_issue_flags(url: str, payload: dict[str, Any]) -> list[dict[str, Any]]:
    norm = normalize_url(url)
    flags: list[dict[str, Any]] = []
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            issue_url = str(issue.get("url") or "")
            if issue_url and normalize_url(issue_url) != norm:
                continue
            flags.append({
                "priority": issue.get("priority"),
                "category_id": cat.get("id"),
                "message": issue.get("message"),
                "url": issue_url or url,
            })
    return flags[:30]


def composite_page_score(
    gsc_page: dict[str, Any] | None,
    ga4_page: dict[str, Any] | None,
    gsc_site: dict[str, Any] | None,
    ga4_site: dict[str, Any] | None,
    issue_flags: list[dict[str, Any]],
    lighthouse: dict[str, Any] | None,
) -> dict[str, Any]:
    score = 75.0
    flags_out: list[str] = []

    site_pos = _num((gsc_site or {}).get("position"), 10)
    page_pos = _num((gsc_page or {}).get("position"), site_pos)
    if page_pos > site_pos + 5:
        score -= 10
        flags_out.append("below_avg_gsc_position")

    site_eng = _num((ga4_site or {}).get("engagementRate"), 0.5)
    page_eng = _num((ga4_page or {}).get("engagementRate"), site_eng)
    if ga4_page and page_eng < site_eng * 0.7:
        score -= 10
        flags_out.append("low_engagement")

    crit = sum(1 for f in issue_flags if str(f.get("priority")) == "Critical")
    high = sum(1 for f in issue_flags if str(f.get("priority")) == "High")
    if crit:
        score -= min(20, crit * 10)
        flags_out.append("critical_issues")
    elif high:
        score -= min(10, high * 5)
        flags_out.append("high_issues")

    if lighthouse:
        perf = _num(lighthouse.get("performance"), 100)
        seo = _num(lighthouse.get("seo"), 100)
        if perf < 50:
            score -= 8
            flags_out.append("poor_lighthouse_performance")
        if seo < 70:
            score -= 5
            flags_out.append("poor_lighthouse_seo")

    score = max(0, min(100, round(score)))
    if score >= 75:
        band = "green"
    elif score >= 50:
        band = "amber"
    else:
        band = "red"
    return {"score": score, "band": band, "flags": flags_out}
