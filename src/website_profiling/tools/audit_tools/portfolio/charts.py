"""Chart and aggregate distribution tools from report payload."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from .._slice import cap_list, parse_limit
from ..context import AuditToolContext


def get_crawl_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    summary = payload.get("summary") or {}
    return {
        "summary": summary,
        "crawl_run_id": payload.get("crawl_run_id"),
        "crawl_run_created_at": payload.get("crawl_run_created_at"),
        "report_generated_at": payload.get("report_generated_at"),
    }


def _label_value_pair(payload: dict[str, Any], labels_key: str, values_key: str) -> list[dict[str, Any]]:
    labels = payload.get(labels_key) or []
    values = payload.get(values_key) or []
    if not isinstance(labels, list):
        labels = []
    if not isinstance(values, list):
        values = []
    out: list[dict[str, Any]] = []
    for i, label in enumerate(labels):
        val = values[i] if i < len(values) else None
        out.append({"label": label, "value": val})
    return out


def get_mime_type_breakdown(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return {"items": _label_value_pair(payload, "mime_labels", "mime_values")}


def get_title_length_distribution(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return {"items": _label_value_pair(payload, "title_labels", "title_counts")}


def get_domain_link_distribution(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return {"items": _label_value_pair(payload, "domain_labels", "domain_values")}


def get_outlink_distribution(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return {"items": _label_value_pair(payload, "outlink_labels", "outlink_counts")}


def get_issue_priority_breakdown(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Chart-friendly issue counts by priority (for chat visualization)."""
    from ..report.report import get_report_summary

    summary = get_report_summary(conn, ctx, args)
    if summary.get("error"):
        return summary
    counts = summary.get("issue_counts") or {}
    if not isinstance(counts, dict):
        counts = {}
    items = [
        {"label": label, "value": int(counts[label])}
        for label in ("Critical", "High", "Medium", "Low")
        if counts.get(label)
    ]
    return {
        "items": items,
        "total_issues": summary.get("total_issues"),
        "health_score": summary.get("health_score"),
    }


def get_top_crawled_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    top = payload.get("top_pages") or []
    if not isinstance(top, list):
        top = []
    limit = parse_limit(args.get("limit"), 20, 50)
    sliced = cap_list(top, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
