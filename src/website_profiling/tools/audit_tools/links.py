"""Internal linking and URL architecture tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ._slice import cap_list, parse_limit, payload_field
from .context import AuditToolContext


def list_orphan_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "orphans": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 50, 50)
    orphans = payload.get("orphan_urls") or []
    if not isinstance(orphans, list):
        orphans = []
    items = [{"url": str(u)} for u in orphans if u]
    sliced = cap_list(items, limit)
    return {"orphans": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_top_linked_pages(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    top = payload.get("top_pages") or []
    if not isinstance(top, list):
        top = []
    sliced = cap_list(top, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_outbound_link_domains(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "domains": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    domains = payload.get("outbound_link_domains") or []
    sliced = cap_list(domains if isinstance(domains, list) else [], limit, max_cap=50)
    return {"domains": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_link_graph_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    nodes = payload.get("graph_nodes") or []
    edges = payload.get("graph_edges") or []
    top_pages = payload.get("top_pages") or []
    hubs = []
    if isinstance(top_pages, list):
        for p in top_pages[:10]:
            if isinstance(p, dict):
                hubs.append({"url": p.get("url"), "inlinks": p.get("inlinks")})
    return {
        "node_count": len(nodes) if isinstance(nodes, list) else 0,
        "edge_count": len(edges) if isinstance(edges, list) else 0,
        "top_hubs": hubs,
    }


def get_url_fingerprints(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "fingerprints": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    fps = payload.get("url_fingerprints") or []
    sliced = cap_list(fps if isinstance(fps, list) else [], limit, max_cap=50)
    return {"fingerprints": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
