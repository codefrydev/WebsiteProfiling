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
