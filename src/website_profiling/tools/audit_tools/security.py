"""Security findings tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ._slice import cap_list, parse_limit
from .context import AuditToolContext


def get_security_findings(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "findings": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 50, 50)
    severity = str(args.get("severity") or "").strip().lower()
    findings = payload.get("security_findings") or []
    if not isinstance(findings, list):
        findings = []
    if severity:
        findings = [
            f for f in findings
            if isinstance(f, dict) and str(f.get("severity") or "").lower() == severity
        ]
    sliced = cap_list(findings, limit, max_cap=50)
    return {"findings": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_security_findings_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "summary": [], "total_findings": 0}
    findings = payload.get("security_findings") or []
    if not isinstance(findings, list):
        findings = []
    by_type: dict[str, dict[str, Any]] = {}
    for f in findings:
        if not isinstance(f, dict):
            continue
        ftype = str(f.get("finding_type") or "unknown")
        entry = by_type.setdefault(ftype, {"finding_type": ftype, "count": 0, "severities": {}})
        entry["count"] += 1
        sev = str(f.get("severity") or "unknown")
        entry["severities"][sev] = entry["severities"].get(sev, 0) + 1
    summary = sorted(by_type.values(), key=lambda x: x["count"], reverse=True)
    return {"summary": summary, "total_findings": len(findings), "type_count": len(summary)}


def list_security_findings_by_type(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "findings": [], "total": 0, "truncated": False}
    finding_type = str(args.get("finding_type") or "").strip().lower()
    if not finding_type:
        return {"error": "finding_type is required", "findings": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 50, 50)
    findings = payload.get("security_findings") or []
    if not isinstance(findings, list):
        findings = []
    filtered = [
        f for f in findings
        if isinstance(f, dict) and str(f.get("finding_type") or "").lower() == finding_type
    ]
    sliced = cap_list(filtered, limit, max_cap=50)
    return {
        "finding_type": finding_type,
        "findings": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }
