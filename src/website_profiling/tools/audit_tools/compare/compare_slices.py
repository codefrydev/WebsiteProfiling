"""Focused compare/drift slice tools."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Any

from psycopg import Connection

from ....reporting.compare_payload import (
    build_category_scores,
    build_content_metrics,
    build_duplicate_deltas,
    build_google_metrics,
    build_indexation_deltas,
    build_issue_deltas,
    build_lighthouse_url_deltas,
    build_link_metric_deltas,
    build_orphan_deltas,
    build_priority_counts,
    build_redirect_deltas,
    build_security_deltas,
    build_seo_health_deltas,
    build_tech_deltas,
    build_url_set_diff,
    _score_from_categories,
)
from .._slice import cap_list, parse_limit
from .compare_helpers import load_compare_pair
from ..context import AuditToolContext


def _compare_meta(current_rid: int | None, baseline_rid: int | None, current: dict, baseline: dict) -> dict[str, Any]:
    return {
        "current_report_id": current_rid,
        "baseline_report_id": baseline_rid,
        "current_generated_at": current.get("report_generated_at"),
        "baseline_generated_at": baseline.get("report_generated_at"),
    }


def compare_issue_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    deltas = build_issue_deltas(current, baseline)
    limit = parse_limit(args.get("limit"), 50, 100)
    sliced = cap_list(deltas, limit, max_cap=100)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "issue_deltas": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def compare_category_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "category_scores": build_category_scores(current, baseline),
    }


def compare_seo_health_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "seo_health_metrics": build_seo_health_deltas(current, baseline),
    }


def compare_lighthouse_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    deltas = build_lighthouse_url_deltas(current, baseline)
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(deltas, limit, max_cap=50)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "lighthouse_url_deltas": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def compare_url_set_diff(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    diff = build_url_set_diff(current, baseline)
    limit = parse_limit(args.get("limit"), 50, 200)
    new_urls = diff.get("new_urls") or []
    removed_urls = diff.get("removed_urls") or []
    new_sliced = cap_list(new_urls, limit, max_cap=200)
    removed_sliced = cap_list(removed_urls, limit, max_cap=200)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "new_urls": new_sliced["items"],
        "new_count": diff.get("new_count", len(new_urls)),
        "new_truncated": new_sliced["truncated"],
        "removed_urls": removed_sliced["items"],
        "removed_count": diff.get("removed_count", len(removed_urls)),
        "removed_truncated": removed_sliced["truncated"],
    }


def compare_redirect_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    deltas = build_redirect_deltas(current, baseline)
    limit = parse_limit(args.get("limit"), 50, 100)
    sliced = cap_list(deltas, limit, max_cap=100)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "redirect_deltas": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def compare_link_metric_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    deltas = build_link_metric_deltas(current, baseline)
    limit = parse_limit(args.get("limit"), 50, 200)
    sliced = cap_list(deltas, limit, max_cap=200)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "link_metric_deltas": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def _compare_list_slice(
    conn: Connection,
    ctx: AuditToolContext,
    args: dict[str, Any],
    *,
    builder,
    result_key: str,
    default_limit: int = 50,
    max_cap: int = 100,
) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    items = builder(current, baseline)
    limit = parse_limit(args.get("limit"), default_limit, max_cap)
    sliced = cap_list(items if isinstance(items, list) else [], limit, max_cap=max_cap)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        result_key: sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }


def compare_security_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _compare_list_slice(conn, ctx, args, builder=build_security_deltas, result_key="security_deltas")


def compare_duplicate_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _compare_list_slice(conn, ctx, args, builder=build_duplicate_deltas, result_key="duplicate_deltas")


def compare_tech_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    return _compare_list_slice(conn, ctx, args, builder=build_tech_deltas, result_key="tech_deltas")


def compare_content_metrics(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "content_metrics": build_content_metrics(current, baseline),
    }


def compare_google_metrics(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    google = build_google_metrics(current, baseline)
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "google_available": google.get("available", False),
        "google_metrics": google.get("metrics") or [],
    }


def compare_priority_counts(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "priority_counts": build_priority_counts(current, baseline),
    }


def compare_health_score_delta(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    cur_health = _score_from_categories(current.get("categories") or [])
    base_health = _score_from_categories(baseline.get("categories") or [])
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "health_score": {
            "current": cur_health,
            "baseline": base_health,
            "delta": (cur_health - base_health) if cur_health is not None and base_health is not None else None,
        },
    }


def compare_indexation_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        **build_indexation_deltas(current, baseline),
    }


def compare_orphan_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None
    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        **build_orphan_deltas(current, baseline),
    }


def compare_geo_score_deltas(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """GEO readiness score drift: compare current vs baseline report (live HTTP checks per call)."""
    current, baseline, cur_rid, base_rid, err = load_compare_pair(conn, ctx, args)
    if err:
        return err
    assert current is not None and baseline is not None

    from ..geo.geo_tools import (
        _fetch_llms_txt,
        _fetch_ai_discovery,
        _score_meta_signals,
        _score_freshness_signals,
        _score_robots_ai_access,
    )

    current_domain: str = current.get("domain") or current.get("property_domain") or ""
    baseline_domain: str = baseline.get("domain") or baseline.get("property_domain") or current_domain

    def _geo_snapshot(domain: str) -> dict[str, Any]:
        """Build a GEO snapshot via concurrent HTTP checks."""
        http_fns = {
            "llms": _fetch_llms_txt,
            "robots": _score_robots_ai_access,
            "meta": _score_meta_signals,
            "freshness": _score_freshness_signals,
            "discovery": _fetch_ai_discovery,
        }
        results: dict[str, dict[str, Any]] = {}
        with ThreadPoolExecutor(max_workers=5) as pool:
            futs = {pool.submit(fn, domain): key for key, fn in http_fns.items()}
            for fut in futs:
                results[futs[fut]] = fut.result()

        llms = results["llms"]
        llms_depth = llms.get("depth", {}) if llms.get("found") else {}
        llms_score = llms_depth.get("depth_score", 0) if llms.get("found") else 0
        robots_score = results["robots"].get("robots_score", 0)
        meta_score = results["meta"].get("meta_score", 0)
        fresh_score = results["freshness"].get("freshness_score", 0)
        disc_score = results["discovery"].get("discovery_score", 0)
        return {
            "llms_txt_score": llms_score,
            "llms_txt_found": llms.get("found", False),
            "robots_score": robots_score,
            "meta_score": meta_score,
            "freshness_score": fresh_score,
            "ai_discovery_score": disc_score,
            "total_score": llms_score + robots_score + meta_score + fresh_score + disc_score,
        }

    # Run both domain snapshots in parallel (10 HTTP requests → wall time ≈ max of 5)
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_cur = pool.submit(_geo_snapshot, current_domain)
        fut_base = pool.submit(_geo_snapshot, baseline_domain)
        cur_snap = fut_cur.result()
        base_snap = fut_base.result()

    deltas: dict[str, Any] = {}
    for key in cur_snap:
        if key.endswith("_found"):
            continue
        cur_val = cur_snap[key]
        base_val = base_snap[key]
        delta = cur_val - base_val if isinstance(cur_val, (int, float)) else None
        deltas[key] = {
            "current": cur_val,
            "baseline": base_val,
            "delta": delta,
            "direction": ("improved" if delta and delta > 0 else ("regressed" if delta and delta < 0 else "unchanged")),
        }

    total_delta = cur_snap["total_score"] - base_snap["total_score"]
    regression = total_delta < -3

    return {
        **_compare_meta(cur_rid, base_rid, current, baseline),
        "current_domain": current_domain,
        "geo_deltas": deltas,
        "total_score_delta": total_delta,
        "regression_detected": regression,
        "provenance": "Estimated",
    }
