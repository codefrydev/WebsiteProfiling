"""Lighthouse query tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...db.lighthouse_store import read_lighthouse_page_summaries, read_lighthouse_summary
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
