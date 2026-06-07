"""Lighthouse query tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...db.lighthouse_store import read_lighthouse_page_summaries, read_lighthouse_summary
from ._slice import cap_list, parse_limit, payload_dict_slice
from .context import AuditToolContext


def get_lighthouse_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)

    summary = payload.get("lighthouse_summary")
    if not isinstance(summary, dict):
        db_summary = read_lighthouse_summary(conn)
        summary = db_summary if isinstance(db_summary, dict) else {}

    human = payload.get("lighthouse_human_summary")
    diagnostics = payload.get("lighthouse_diagnostics")
    page_summaries = payload.get("lighthouse_by_url")
    if not isinstance(page_summaries, dict):
        page_summaries = read_lighthouse_page_summaries(conn) or {}

    poor_pages = []
    for url, data in list(page_summaries.items())[:20]:
        if not isinstance(data, dict):
            continue
        perf = data.get("performance") or data.get("scores", {}).get("performance")
        if perf is not None and float(perf) < 50:
            poor_pages.append({"url": url, "performance": perf})

    return {
        "summary": summary,
        "human_summary": human if isinstance(human, str) else None,
        "diagnostics_count": len(diagnostics) if isinstance(diagnostics, list) else 0,
        "pages_audited": len(page_summaries) if isinstance(page_summaries, dict) else 0,
        "poor_performance_pages": poor_pages[:10],
    }


def get_lighthouse_for_url(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip().rstrip("/")
    if not url:
        return {"error": "url is required"}

    payload = scoped.load_payload(conn)
    by_url = payload.get("lighthouse_by_url") or {}
    if not isinstance(by_url, dict):
        by_url = read_lighthouse_page_summaries(conn) or {}

    data = by_url.get(url) or by_url.get(url + "/")
    if not data:
        return {"error": "no lighthouse data for url", "url": url}
    return {"url": url, "lighthouse": data}


def get_lighthouse_diagnostics(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "diagnostics": [], "total": 0}
    limit = parse_limit(args.get("limit"), 30, 50)
    diag = payload.get("lighthouse_diagnostics") or []
    sliced = cap_list(diag if isinstance(diag, list) else [], limit, max_cap=50)
    return {"diagnostics": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_crux_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    crux = payload.get("crux_summary")
    if not crux:
        return {"error": "crux_summary not in report — CrUX fetch may have failed or been skipped", "missing": True}
    return payload_dict_slice(payload, "crux_summary")


def list_slow_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0}
    limit = parse_limit(args.get("limit"), 30, 50)
    threshold = parse_limit(args.get("performance_threshold"), 50, 100)
    by_url = payload.get("lighthouse_by_url") or {}
    slow = []
    if isinstance(by_url, dict):
        for url, data in by_url.items():
            if not isinstance(data, dict):
                continue
            perf = data.get("performance") or (data.get("scores") or {}).get("performance")
            if perf is not None and float(perf) < threshold:
                slow.append({"url": url, "performance": perf})
    slow.sort(key=lambda x: float(x.get("performance") or 0))
    sliced = cap_list(slow, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "threshold": threshold}


def get_lighthouse_human_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    text = payload.get("lighthouse_human_summary")
    if not text:
        summary = payload.get("lighthouse_summary") or {}
        if isinstance(summary, dict):
            text = summary.get("human_summary_full") or summary.get("human_summary")
    return {
        "human_summary": str(text or ""),
        "has_summary": bool(str(text or "").strip()),
    }


def list_lighthouse_poor_seo_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    threshold = parse_limit(args.get("seo_threshold"), 80, 100)
    by_url = payload.get("lighthouse_by_url") or {}
    poor = []
    if isinstance(by_url, dict):
        for url, data in by_url.items():
            if not isinstance(data, dict):
                continue
            seo = data.get("seo") or (data.get("scores") or {}).get("seo")
            if seo is not None and float(seo) < threshold:
                poor.append({"url": url, "seo": seo})
    poor.sort(key=lambda x: float(x.get("seo") or 0))
    sliced = cap_list(poor, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "threshold": threshold}
