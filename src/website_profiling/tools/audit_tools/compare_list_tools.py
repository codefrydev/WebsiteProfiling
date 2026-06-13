"""Report compare list tools using compare_helpers and compare_payload builders."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...reporting.compare_payload import (
    build_issue_deltas,
    build_lighthouse_url_deltas,
    build_url_set_diff,
)
from ._slice import cap_list, parse_limit
from .compare_helpers import load_compare_pair
from .context import AuditToolContext
from .google_lists import _gsc_rows, _index_gsc_rows, _num


def _compare_meta(current_rid: int | None, baseline_rid: int | None, current: dict, baseline: dict) -> dict[str, Any]:
    return {
        "current_report_id": current_rid,
        "baseline_report_id": baseline_rid,
        "current_generated_at": current.get("report_generated_at"),
        "baseline_generated_at": baseline.get("report_generated_at"),
    }


def list_compare_new_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return {**err, "issues": [], "total": 0, "truncated": False}
    assert current is not None and baseline is not None
    deltas = [d for d in build_issue_deltas(current, baseline) if d.get("kind") == "new"]
    limit = parse_limit(args.get("limit"), 50, 100)
    sliced = cap_list(deltas, limit, max_cap=100)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "issues": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def list_compare_resolved_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return {**err, "issues": [], "total": 0, "truncated": False}
    assert current is not None and baseline is not None
    deltas = [d for d in build_issue_deltas(current, baseline) if d.get("kind") == "resolved"]
    limit = parse_limit(args.get("limit"), 50, 100)
    sliced = cap_list(deltas, limit, max_cap=100)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "issues": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def list_compare_new_urls(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return {**err, "urls": [], "total": 0, "truncated": False}
    assert current is not None and baseline is not None
    diff = build_url_set_diff(current, baseline)
    new_urls = diff.get("new_urls") or []
    limit = parse_limit(args.get("limit"), 50, 200)
    sliced = cap_list(new_urls, limit, max_cap=200)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "urls": sliced["items"],
        "total": diff.get("new_count", sliced["total"]),
        "truncated": sliced["truncated"],
    }


def list_compare_removed_urls(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return {**err, "urls": [], "total": 0, "truncated": False}
    assert current is not None and baseline is not None
    diff = build_url_set_diff(current, baseline)
    removed_urls = diff.get("removed_urls") or []
    limit = parse_limit(args.get("limit"), 50, 200)
    sliced = cap_list(removed_urls, limit, max_cap=200)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "urls": sliced["items"],
        "total": diff.get("removed_count", sliced["total"]),
        "truncated": sliced["truncated"],
    }


def list_compare_lighthouse_regressions(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return {**err, "pages": [], "total": 0, "truncated": False}
    assert current is not None and baseline is not None
    try:
        min_drop = float(args.get("min_regression") or 5)
    except (TypeError, ValueError):
        min_drop = 5.0
    deltas = build_lighthouse_url_deltas(current, baseline)
    regressions: list[dict[str, Any]] = []
    for row in deltas:
        perf_delta = row.get("performance_delta")
        seo_delta = row.get("seo_delta")
        perf_drop = perf_delta is not None and perf_delta <= -min_drop
        seo_drop = seo_delta is not None and seo_delta <= -min_drop
        if perf_drop or seo_drop:
            regressions.append({**row, "regression_type": "performance" if perf_drop else "seo"})
    regressions.sort(key=lambda r: min(r.get("performance_delta") or 0, r.get("seo_delta") or 0))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(regressions, limit, max_cap=50)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "min_regression": min_drop,
    }


def list_compare_traffic_losers(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return {**err, "pages": [], "total": 0, "truncated": False}
    assert current is not None and baseline is not None

    cur_google = current.get("google") if isinstance(current.get("google"), dict) else None
    base_google = baseline.get("google") if isinstance(baseline.get("google"), dict) else None
    if not cur_google:
        cur_google = scoped.load_google_full(conn) or scoped.load_google(conn)
    if not cur_google or not base_google:
        return {
            **_compare_meta(cur_rid, base_rid, current, baseline),
            "error": "google data missing on current or baseline report",
            "missing": True,
            "pages": [],
            "total": 0,
            "truncated": False,
        }
    cur_pages = _index_gsc_rows(_gsc_rows(cur_google, "pages"), ("page", "url"))
    base_pages = _index_gsc_rows(_gsc_rows(base_google, "pages"), ("page", "url"))

    losers: list[dict[str, Any]] = []
    for key, cur_row in cur_pages.items():
        base_row = base_pages.get(key)
        if not base_row:
            continue
        cur_clicks = _num(cur_row.get("clicks"))
        base_clicks = _num(base_row.get("clicks"))
        delta = cur_clicks - base_clicks
        if delta >= 0:
            continue
        url = str(cur_row.get("page") or cur_row.get("url") or key)
        losers.append({
            "url": url,
            "clicks_current": cur_clicks,
            "clicks_baseline": base_clicks,
            "click_delta": delta,
            "impressions_current": _num(cur_row.get("impressions")),
            "impressions_baseline": _num(base_row.get("impressions")),
        })
    losers.sort(key=lambda r: r.get("click_delta", 0))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(losers, limit, max_cap=50)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }
