"""Indexation coverage tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ._slice import cap_list, parse_limit
from .context import AuditToolContext

_GAP_TYPES = frozenset({"sitemap_only", "crawled_not_in_sitemap", "gsc_not_crawled"})


def get_indexation_coverage(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    cov = payload.get("indexation_coverage")
    if not isinstance(cov, dict):
        return {
            "error": "indexation_coverage not in report — run audit with GSC connected",
            "missing": True,
        }
    return {"indexation_coverage": cov}


def list_indexation_gaps(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "urls": [], "total": 0, "truncated": False}
    cov = payload.get("indexation_coverage")
    if not isinstance(cov, dict):
        return {"error": "indexation_coverage not in report", "missing": True, "urls": [], "total": 0, "truncated": False}
    gap_type = str(args.get("gap_type") or "").strip()
    if gap_type not in _GAP_TYPES:
        return {
            "error": f"gap_type must be one of: {', '.join(sorted(_GAP_TYPES))}",
            "urls": [],
            "total": 0,
            "truncated": False,
        }
    lists = cov.get("lists") or {}
    urls = lists.get(gap_type) if isinstance(lists, dict) else []
    if not isinstance(urls, list):
        urls = []
    totals = cov.get("lists_total") or {}
    total_all = totals.get(gap_type) if isinstance(totals, dict) else len(urls)
    limit = parse_limit(args.get("limit"), 50, 200)
    sliced = cap_list(urls, limit, max_cap=200)
    return {
        "gap_type": gap_type,
        "urls": sliced["items"],
        "total": int(total_all or sliced["total"]),
        "truncated": sliced["truncated"] or (int(total_all or 0) > limit),
        "counts": cov.get("counts"),
    }


def get_indexation_url_join(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    cov = payload.get("indexation_coverage")
    if not isinstance(cov, dict):
        return {"error": "indexation_coverage not in report", "missing": True}
    url_join = cov.get("url_join")
    if url_join is None:
        return {"error": "url_join not in indexation_coverage", "missing": True}
    return {"url_join": url_join, "counts": cov.get("counts")}
