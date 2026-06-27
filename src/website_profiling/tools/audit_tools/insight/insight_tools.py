"""Cross-platform insight audit tools (GSC + GA4 + crawl + issues)."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ....integrations.google.page_lookup import slice_from_google_row
from .._slice import cap_list, parse_limit
from ..context import AuditToolContext
from .insight_helpers import (
    blend_landing_pages,
    composite_page_score,
    page_issue_flags,
    provenance_block,
    traffic_health_ratio,
)
from ..report.report import list_issues


def _gsc_ga4_blobs(raw: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    gsc = raw.get("gsc_full") if isinstance(raw.get("gsc_full"), dict) else raw.get("gsc") or {}
    ga4 = raw.get("ga4_full") if isinstance(raw.get("ga4_full"), dict) else raw.get("ga4") or {}
    return gsc if isinstance(gsc, dict) else {}, ga4 if isinstance(ga4, dict) else {}


def get_landing_page_blended_table(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    raw = scoped.load_google_full(conn)
    if not raw:
        return {"error": "no google data found", "missing": True, "rows": []}
    gsc, ga4 = _gsc_ga4_blobs(raw)
    by_page = gsc.get("by_page") if isinstance(gsc.get("by_page"), dict) else {}
    by_path = ga4.get("by_path") if isinstance(ga4.get("by_path"), dict) else {}
    if not by_page and gsc.get("top_pages"):
        by_page = {str(r.get("page")): r for r in (gsc.get("top_pages") or []) if isinstance(r, dict) and r.get("page")}
    limit = parse_limit(args.get("limit"), 30, 100)
    min_impressions = parse_limit(args.get("min_impressions"), 0, 1_000_000)
    rows = blend_landing_pages(by_page, by_path, limit=limit, min_impressions=min_impressions)
    return {
        "rows": rows,
        "total": len(rows),
        "truncated": len(by_page) > limit,
        "provenance": provenance_block(["gsc", "ga4"], raw.get("fetched_at")),
        "insights": [
            f"{sum(1 for r in rows if r['quadrant'] == 'high_impact')} high-impact landing pages",
            f"{sum(1 for r in rows if r['quadrant'] == 'worth_optimizing')} worth optimizing for rank",
        ],
    }


def get_opportunity_matrix(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    blended = get_landing_page_blended_table(conn, ctx, args)
    if blended.get("error"):
        return blended
    quadrants: dict[str, list[dict[str, Any]]] = {
        "high_impact": [],
        "worth_optimizing": [],
        "good_but_capped": [],
        "low_priority": [],
    }
    for row in blended.get("rows") or []:
        q = str(row.get("quadrant") or "low_priority")
        quadrants.setdefault(q, []).append(row)
    counts = {k: len(v) for k, v in quadrants.items()}
    return {
        "quadrants": quadrants,
        "counts": counts,
        "provenance": blended.get("provenance"),
        "insights": [
            f"Focus on {counts.get('high_impact', 0)} high-impact pages first.",
            f"{counts.get('worth_optimizing', 0)} pages could rank higher with on-page work.",
        ],
    }


def get_traffic_health_check(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    raw = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not raw:
        return {"error": "no google data found", "missing": True}
    gsc, ga4 = _gsc_ga4_blobs(raw)
    health = traffic_health_ratio(
        gsc.get("summary") if isinstance(gsc.get("summary"), dict) else {},
        ga4.get("summary") if isinstance(ga4.get("summary"), dict) else {},
    )
    return {
        **health,
        "provenance": provenance_block(["gsc", "ga4"], raw.get("fetched_at")),
        "insights": [health.get("note") or ""],
    }


def get_landing_page_full_diagnosis(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "missing": True}
    raw = scoped.load_google_full(conn) or scoped.load_google(conn) or {}
    slice_data = slice_from_google_row(raw, url)
    gsc_page = (slice_data.get("gsc") or {}) if isinstance(slice_data.get("gsc"), dict) else None
    ga4_page = (slice_data.get("ga4") or {}) if isinstance(slice_data.get("ga4"), dict) else None
    benchmarks = slice_data.get("siteBenchmarks") or {}
    flags = page_issue_flags(url, payload)
    lh = (payload.get("lighthouse_by_url") or {}).get(url) or {}
    score = composite_page_score(
        gsc_page, ga4_page,
        (benchmarks.get("gsc") or {}) if isinstance(benchmarks.get("gsc"), dict) else {},
        (benchmarks.get("ga4") or {}) if isinstance(benchmarks.get("ga4"), dict) else {},
        flags,
        lh if isinstance(lh, dict) else None,
    )
    crawl_row = None
    for row in payload.get("top_pages") or []:
        if isinstance(row, dict) and str(row.get("url") or "") == url:
            crawl_row = row
            break
    return {
        "url": url,
        "gsc_ga4": slice_data,
        "issues": flags,
        "lighthouse": lh or None,
        "crawl": crawl_row,
        "diagnosis": score,
        "provenance": provenance_block(
            ["gsc", "ga4", "crawl", "audit"],
            raw.get("fetched_at") or payload.get("report_generated_at"),
        ),
        "insights": score.get("flags") or [],
    }


def get_issue_to_traffic_map(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    result = list_issues(conn, ctx, {**args, "sort": "impact"})
    if result.get("error"):
        return result
    issues = result.get("issues") or []
    rows = []
    for issue in issues:
        if not isinstance(issue, dict):
            continue
        rows.append({
            "url": issue.get("url"),
            "priority": issue.get("priority"),
            "category": issue.get("category"),
            "message": issue.get("message"),
            "impact_score": issue.get("impact_score"),
            "gsc_clicks": issue.get("gsc_clicks"),
            "ga4_sessions": issue.get("ga4_sessions"),
        })
    return {
        "issues": rows,
        "total": result.get("total"),
        "truncated": result.get("truncated"),
        "provenance": provenance_block(["audit", "gsc", "ga4"]),
        "insights": ["Issues sorted by traffic-weighted impact_score."],
    }
