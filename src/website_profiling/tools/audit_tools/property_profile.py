"""MCP/chat tools for property profile: site files, subdomains, contacts."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ._slice import cap_list, parse_limit
from .context import AuditToolContext


def _site_level_or_error(payload: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    site_level = payload.get("site_level")
    if not isinstance(site_level, dict):
        return None, {"error": "site_level not in payload", "missing": True}
    return site_level, None


def get_ads_txt_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    site_level, err = _site_level_or_error(payload)
    if err:
        return err
    return {
        "ads_txt_present": site_level.get("ads_txt_present"),
        "ads_txt_valid": site_level.get("ads_txt_valid"),
        "ads_txt_line_count": site_level.get("ads_txt_line_count"),
        "ads_txt_issues": site_level.get("ads_txt_issues") or [],
    }


def get_security_txt_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    site_level, err = _site_level_or_error(payload)
    if err:
        return err
    return {
        "security_txt_present": site_level.get("security_txt_present"),
        "security_txt_valid": site_level.get("security_txt_valid"),
        "security_txt_contact": site_level.get("security_txt_contact") or [],
        "security_txt_expires": site_level.get("security_txt_expires"),
    }


def list_subdomains(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    data = payload.get("subdomains")
    if not isinstance(data, dict):
        return {"error": "subdomains not in report payload", "missing": True}
    in_scope_only = args.get("in_scope_only", True)
    if isinstance(in_scope_only, str):
        in_scope_only = in_scope_only.lower() not in ("false", "0", "no")
    hosts = data.get("hosts") or []
    if in_scope_only:
        hosts = [h for h in hosts if isinstance(h, dict) and h.get("in_scope")]
    limit = parse_limit(args.get("limit"), 50, 200)
    sliced = cap_list(hosts, limit, max_cap=200)
    return {
        "apex": data.get("apex"),
        "hosts": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "gsc_hosts_not_crawled": data.get("gsc_hosts_not_crawled") or [],
        "out_of_scope_discovered": data.get("out_of_scope_discovered") or [],
    }


def get_contact_intelligence(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    data = payload.get("contact_intelligence")
    if not isinstance(data, dict):
        return {"error": "contact_intelligence not in report payload", "missing": True}
    limit = parse_limit(args.get("limit"), 50, 100)

    def _cap(key: str) -> list[Any]:
        items = data.get(key) or []
        if not isinstance(items, list):
            return []
        return items[:limit]

    return {
        "emails": _cap("emails"),
        "phones": _cap("phones"),
        "addresses": _cap("addresses"),
        "organization_names": _cap("organization_names"),
        "primary_contact_page": data.get("primary_contact_page"),
        "consistency_notes": data.get("consistency_notes") or [],
    }
