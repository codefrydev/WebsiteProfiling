"""Report payload slices: rich results, portfolio benchmark, competitor gaps, anchors."""
from __future__ import annotations

from collections import Counter
from typing import Any

from psycopg import Connection

from ._slice import _parse_page_analysis, cap_list, parse_limit, payload_dict_slice
from .context import AuditToolContext


def get_rich_results_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "missing": True}
    meta = payload.get("rich_results_meta")
    if not isinstance(meta, dict):
        return {"missing": True, "meta": None, "note": "rich_results_meta not in report — enable rich results validation on build"}
    return {"meta": meta, "missing": False, "provenance": "Crawl / GSC / API"}


def list_rich_results_failures(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "failures": [], "total": 0, "truncated": False}
    rows = payload.get("rich_results_validation") or []
    if not isinstance(rows, list):
        rows = []
    failures = [
        r for r in rows
        if isinstance(r, dict) and str(r.get("status") or "").lower() not in ("pass", "ok")
    ]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(failures, limit, max_cap=50)
    return {
        "failures": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "provenance": "Crawl / GSC / API",
    }


def get_competitor_keyword_gap(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "rows": [], "total": 0, "truncated": False}
    rows = payload.get("competitor_keyword_gap") or []
    if not isinstance(rows, list):
        rows = []
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(rows, limit, max_cap=50)
    return {
        "rows": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "provenance": "Estimated",
    }


def get_portfolio_benchmark(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "missing": True}
    result = payload_dict_slice(payload, "portfolio_benchmark")
    if result.get("missing"):
        return {"missing": True, "benchmark": None, "note": "portfolio_benchmark not in report"}
    return {"benchmark": result.get("data"), "missing": False, "provenance": "Crawl"}


def get_site_anchor_text_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "anchors": [], "total": 0, "truncated": False}
    matrix = payload.get("inlink_anchor_matrix") or []
    if not isinstance(matrix, list) or not matrix:
        return {
            "anchors": [],
            "total": 0,
            "truncated": False,
            "missing": True,
            "note": "inlink_anchor_matrix not in report — rebuild with link_edges",
        }
    counter: Counter[str] = Counter()
    for row in matrix:
        if not isinstance(row, dict):
            continue
        anchor = str(row.get("anchor_text") or "").strip() or "(empty)"
        try:
            count = int(row.get("inlink_count") or 0)
        except (TypeError, ValueError):
            count = 0
        counter[anchor] += count
    ranked = [{"anchor_text": a, "inlink_count": c} for a, c in counter.most_common()]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(ranked, limit, max_cap=50)
    return {
        "anchors": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "provenance": "Crawl",
    }


def get_pagination_audit_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"orphan_prev_count": 0, "amp_mismatch_count": 0, "pages_with_rel_next": 0, "pages_with_rel_prev": 0}
    orphan_prev = 0
    amp_mismatch = 0
    rel_next = 0
    rel_prev = 0
    for _, row in df.iterrows():
        if not str(row.get("status") or "").startswith("2"):
            continue
        pa = _parse_page_analysis(row.to_dict())
        pag = pa.get("pagination") if isinstance(pa.get("pagination"), dict) else {}
        has_next = bool(pag.get("rel_next"))
        has_prev = bool(pag.get("rel_prev"))
        if has_next:
            rel_next += 1
        if has_prev:
            rel_prev += 1
        if has_prev and not has_next:
            orphan_prev += 1
        amphtml = pag.get("amphtml")
        canon = str(row.get("canonical_url") or "").strip()
        if amphtml and canon and amphtml != canon:
            amp_mismatch += 1
    return {
        "orphan_prev_count": orphan_prev,
        "amp_mismatch_count": amp_mismatch,
        "pages_with_rel_next": rel_next,
        "pages_with_rel_prev": rel_prev,
        "provenance": "Crawl",
    }
