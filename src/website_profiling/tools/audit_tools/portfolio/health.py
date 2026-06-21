"""Health history query tools."""
from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

from ....db._common import _row_field
from ..context import AuditToolContext


def get_health_history(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    property_id = scoped.property_id
    if property_id is None:
        return {"error": "property_id is required"}

    limit = args.get("limit", 10)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 30))

    cur = conn.execute(
        """SELECT health_score, category_scores, issue_counts, generated_at, report_id
           FROM audit_health_snapshots
           WHERE property_id = %s
           ORDER BY generated_at DESC, id DESC
           LIMIT %s""",
        (property_id, limit),
    )
    snapshots = []
    for row in cur.fetchall() or []:
        cat_scores = _row_field(row, "category_scores", index=1)
        issue_counts = _row_field(row, "issue_counts", index=2)
        if isinstance(cat_scores, str):
            try:
                cat_scores = json.loads(cat_scores)
            except json.JSONDecodeError:
                cat_scores = {}
        if isinstance(issue_counts, str):
            try:
                issue_counts = json.loads(issue_counts)
            except json.JSONDecodeError:
                issue_counts = {}
        gen = _row_field(row, "generated_at", index=3)
        snapshots.append({
            "health_score": _row_field(row, "health_score", index=0),
            "category_scores": cat_scores,
            "issue_counts": issue_counts,
            "generated_at": gen.isoformat() if hasattr(gen, "isoformat") else str(gen or ""),
            "report_id": _row_field(row, "report_id", index=4),
        })

    return {
        "property_id": property_id,
        "snapshots": snapshots,
        "count": len(snapshots),
    }


def list_report_history(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    from .._slice import parse_limit as _parse_limit

    limit = _parse_limit(args.get("limit"), 20, 50)
    clauses: list[str] = []
    params: list[Any] = []
    domain = scoped.resolve_property_domain(conn)
    # Only filter when a domain actually resolved. Previously an unresolvable
    # property (domain == "") produced `WHERE canonical_domain = ''`, which matches
    # no rows — silently returning empty history instead of recent reports.
    if domain:
        clauses.append("canonical_domain = %s")
        params.append(domain)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    cur = conn.execute(
        f"""SELECT id, site_name, canonical_domain, generated_at
            FROM report_payload {where}
            ORDER BY generated_at DESC
            LIMIT %s""",
        tuple(params),
    )
    reports = []
    for row in cur.fetchall() or []:
        reports.append({
            "report_id": _row_field(row, "id", index=0),
            "site_name": _row_field(row, "site_name", index=1),
            "canonical_domain": _row_field(row, "canonical_domain", index=2),
            "generated_at": _iso(_row_field(row, "generated_at", index=3)),
        })
    return {"reports": reports, "count": len(reports)}


def _iso(val: Any) -> str:
    return val.isoformat() if hasattr(val, "isoformat") else str(val or "")


def get_category_health_history(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    property_id = scoped.property_id
    if property_id is None:
        return {"error": "property_id is required"}
    category_id = str(args.get("category_id") or "").strip()
    limit = args.get("limit", 10)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 10
    limit = max(1, min(limit, 30))

    cur = conn.execute(
        """SELECT category_scores, generated_at, report_id, health_score
           FROM audit_health_snapshots
           WHERE property_id = %s
           ORDER BY generated_at DESC, id DESC
           LIMIT %s""",
        (property_id, limit),
    )
    points = []
    for row in cur.fetchall() or []:
        cat_scores = _row_field(row, "category_scores", index=0)
        if isinstance(cat_scores, str):
            try:
                cat_scores = json.loads(cat_scores)
            except json.JSONDecodeError:
                cat_scores = {}
        if not isinstance(cat_scores, dict):
            cat_scores = {}
        score = cat_scores.get(category_id) if category_id else None
        gen = _row_field(row, "generated_at", index=1)
        points.append({
            "generated_at": gen.isoformat() if hasattr(gen, "isoformat") else str(gen or ""),
            "report_id": _row_field(row, "report_id", index=2),
            "health_score": _row_field(row, "health_score", index=3),
            "category_score": score,
            "category_scores": cat_scores if not category_id else None,
        })
    return {
        "property_id": property_id,
        "category_id": category_id or None,
        "points": points,
        "count": len(points),
    }
