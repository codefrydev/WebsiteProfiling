"""Additional report payload slices not covered by core report tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from .._slice import cap_list, parse_limit
from ..context import AuditToolContext


def get_audit_recommendations(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "recommendations": []}
    recs = payload.get("recommendations") or []
    if not isinstance(recs, list):
        recs = []
    return {"recommendations": recs, "count": len(recs)}


def get_ml_errors(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "errors": []}
    errors = payload.get("ml_errors") or []
    if not isinstance(errors, list):
        errors = []
    return {"errors": errors, "count": len(errors)}


def get_ssl_expiry_info(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return {
        "site_ssl_expires_at": payload.get("site_ssl_expires_at"),
        "site_name": payload.get("site_name"),
    }


def list_audit_categories(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "categories": []}
    cats = payload.get("categories") or []
    out = []
    for cat in cats:
        if not isinstance(cat, dict):
            continue
        issues = cat.get("issues") or []
        recs = cat.get("recommendations") or []
        out.append({
            "id": cat.get("id"),
            "name": cat.get("name"),
            "score": cat.get("score"),
            "issue_count": len(issues) if isinstance(issues, list) else 0,
            "recommendation_count": len(recs) if isinstance(recs, list) else 0,
        })
    return {"categories": out, "count": len(out)}


def get_category_recommendations(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    category_id = str(args.get("category_id") or "").strip()
    if not category_id:
        return {"error": "category_id is required"}
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        cid = str(cat.get("id") or "").strip()
        if cid == category_id:
            recs = cat.get("recommendations") or []
            return {
                "category_id": category_id,
                "category_name": cat.get("name"),
                "recommendations": recs if isinstance(recs, list) else [],
            }
    return {"error": f"category {category_id} not found", "recommendations": []}


def list_issues_with_ai_fixes(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "issues": [], "total": 0, "truncated": False}
    matches: list[dict[str, Any]] = []
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        cat_name = str(cat.get("name") or cat.get("id") or "")
        for iss in cat.get("issues") or []:
            if not isinstance(iss, dict):
                continue
            llm = str(iss.get("llm_recommendation") or "").strip()
            if not llm:
                continue
            matches.append({
                "category": cat_name,
                "priority": iss.get("priority"),
                "url": iss.get("url"),
                "message": iss.get("message"),
                "recommendation": iss.get("recommendation"),
                "llm_recommendation": llm,
            })
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(matches, limit, max_cap=50)
    return {"issues": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
