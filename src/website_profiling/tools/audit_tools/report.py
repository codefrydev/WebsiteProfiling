"""Report summary and issue query tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...reporting.terminology import category_display_name
from .context import AuditToolContext

_PRIORITY_ORDER = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
_ISSUE_LIMIT_DEFAULT = 20
_ISSUE_LIMIT_MAX = 50


def _normalize_priority(p: str) -> str:
    raw = (p or "").strip()
    if not raw:
        return ""
    cap = raw[0].upper() + raw[1:].lower()
    if cap in _PRIORITY_ORDER:
        return cap
    return raw


def _iter_category_issues(payload: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        cat_id = str(cat.get("id") or "")
        cat_name = category_display_name(str(cat.get("name") or cat_id))
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            rec = str(issue.get("llm_recommendation") or issue.get("recommendation") or "")
            rows.append({
                "category_id": cat_id,
                "category": cat_name,
                "priority": str(issue.get("priority") or "Medium"),
                "message": str(issue.get("message") or ""),
                "url": str(issue.get("url") or ""),
                "recommendation": rec,
            })
    rows.sort(key=lambda x: _PRIORITY_ORDER.get(x.get("priority", "Low"), 99))
    return rows


def _health_score(payload: dict[str, Any]) -> int | None:
    scores = [
        float(c.get("score"))
        for c in (payload.get("categories") or [])
        if isinstance(c, dict) and isinstance(c.get("score"), (int, float))
    ]
    return round(sum(scores) / len(scores)) if scores else None


def _issue_counts(issues: list[dict[str, Any]]) -> dict[str, int]:
    counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for issue in issues:
        p = str(issue.get("priority") or "Medium")
        counts[p] = counts.get(p, 0) + 1
    return counts


def get_report_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    all_issues = _iter_category_issues(payload)
    summary = payload.get("summary") or {}
    categories = []
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        categories.append({
            "id": cat.get("id"),
            "name": category_display_name(str(cat.get("name") or "")),
            "score": cat.get("score"),
            "issue_count": len(cat.get("issues") or []),
        })
    return {
        "site_name": payload.get("site_name"),
        "report_generated_at": payload.get("report_generated_at"),
        "health_score": _health_score(payload),
        "issue_counts": _issue_counts(all_issues),
        "total_issues": len(all_issues),
        "crawl_summary": {
            "total_urls": summary.get("total_urls"),
            "count_2xx": summary.get("count_2xx"),
            "count_3xx": summary.get("count_3xx"),
            "count_4xx": summary.get("count_4xx"),
            "count_5xx": summary.get("count_5xx"),
            "success_rate": summary.get("success_rate"),
        },
        "categories": categories,
        "property_id": scoped.property_id,
        "report_id": scoped.report_id,
    }


def list_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "issues": [], "total": 0, "truncated": False}

    limit = args.get("limit", _ISSUE_LIMIT_DEFAULT)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = _ISSUE_LIMIT_DEFAULT
    limit = max(1, min(limit, _ISSUE_LIMIT_MAX))

    priority_filter = _normalize_priority(str(args.get("priority") or ""))
    category_id = str(args.get("category_id") or "").strip()
    url_contains = str(args.get("url_contains") or "").strip().lower()

    issues = _iter_category_issues(payload)
    if priority_filter:
        issues = [i for i in issues if i.get("priority") == priority_filter]
    if category_id:
        issues = [i for i in issues if i.get("category_id") == category_id]
    if url_contains:
        issues = [i for i in issues if url_contains in str(i.get("url") or "").lower()]

    sort_mode = str(args.get("sort") or "").strip().lower()
    if sort_mode == "impact":
        from ...reporting.issue_impact import sort_issues_by_impact

        issues = sort_issues_by_impact(issues)

    total = len(issues)
    truncated = total > limit
    return {
        "issues": issues[:limit],
        "total": total,
        "truncated": truncated,
    }


def search_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Search issues with combined filters including message substring."""
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "issues": [], "total": 0, "truncated": False}

    limit = args.get("limit", _ISSUE_LIMIT_DEFAULT)
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = _ISSUE_LIMIT_DEFAULT
    limit = max(1, min(limit, _ISSUE_LIMIT_MAX))

    priority_filter = _normalize_priority(str(args.get("priority") or ""))
    category_id = str(args.get("category_id") or "").strip()
    url_contains = str(args.get("url_contains") or "").strip().lower()
    message_contains = str(args.get("message_contains") or "").strip().lower()

    issues = _iter_category_issues(payload)
    if priority_filter:
        issues = [i for i in issues if i.get("priority") == priority_filter]
    if category_id:
        issues = [i for i in issues if i.get("category_id") == category_id]
    if url_contains:
        issues = [i for i in issues if url_contains in str(i.get("url") or "").lower()]
    if message_contains:
        issues = [
            i for i in issues
            if message_contains in str(i.get("message") or "").lower()
            or message_contains in str(i.get("recommendation") or "").lower()
        ]

    total = len(issues)
    truncated = total > limit
    return {
        "issues": issues[:limit],
        "total": total,
        "truncated": truncated,
    }


def get_critical_issues(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """All Critical-priority audit issues (chat table visualization)."""
    return list_issues(conn, ctx, {**args, "priority": "Critical"})


def get_category_scores(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "categories": []}
    categories = []
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        categories.append({
            "id": cat.get("id"),
            "name": category_display_name(str(cat.get("name") or "")),
            "score": cat.get("score"),
            "issue_count": len(cat.get("issues") or []),
        })
    return {"categories": categories, "health_score": _health_score(payload)}


def get_executive_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    summary = payload.get("executive_summary")
    if not summary:
        return {"error": "executive_summary not generated — enable AI in audit settings", "missing": True}
    return {"executive_summary": summary}


def get_report_meta(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    meta = payload.get("report_meta")
    if not isinstance(meta, dict):
        return {"error": "report_meta not in payload", "missing": True}
    return {"report_meta": meta}


def get_site_level(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    site_level = payload.get("site_level")
    if not isinstance(site_level, dict):
        return {"error": "site_level not in payload", "missing": True}
    return {"site_level": site_level}
