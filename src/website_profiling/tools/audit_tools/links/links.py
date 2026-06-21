"""Internal linking and URL architecture tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from .._slice import cap_list, parse_limit, payload_field
from ..context import AuditToolContext


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


def list_broken_link_sources(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "sources": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    issues = payload.get("issues") or {}
    broken = issues.get("broken") if isinstance(issues, dict) else []
    broken_urls = {
        str(b.get("url") or "").strip()
        for b in (broken if isinstance(broken, list) else [])
        if isinstance(b, dict) and b.get("url")
    }
    if not broken_urls:
        return {"sources": [], "total": 0, "truncated": False}
    source_map: dict[str, list[str]] = {}
    edges = payload.get("graph_edges") or []
    if isinstance(edges, list):
        for edge in edges:
            if isinstance(edge, dict):
                src = str(edge.get("from") or edge.get("source") or "").strip()
                tgt = str(edge.get("to") or edge.get("target") or "").strip()
            elif isinstance(edge, (list, tuple)) and len(edge) >= 2:
                src, tgt = str(edge[0]).strip(), str(edge[1]).strip()
            else:
                continue
            if tgt in broken_urls and src:
                source_map.setdefault(tgt, []).append(src)
    items = []
    for tgt, srcs in source_map.items():
        unique_srcs = sorted(set(srcs))
        items.append({
            "broken_url": tgt,
            "source_count": len(unique_srcs),
            "source_urls": unique_srcs[:10],
        })
    items.sort(key=lambda x: x["source_count"], reverse=True)
    sliced = cap_list(items, limit, max_cap=50)
    return {"sources": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_link_rel_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    summary = payload.get("link_rel_summary")
    if isinstance(summary, dict):
        return summary
    from ....reporting.link_edges_report import summarize_link_rel

    edges = payload.get("link_edges") or []
    return summarize_link_rel(edges if isinstance(edges, list) else [])


def get_inlink_anchors(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "rows": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 50, 200)
    target = str(args.get("url") or args.get("target_url") or "").strip().rstrip("/").lower()
    rows = payload.get("inlink_anchor_matrix") or []
    if not isinstance(rows, list):
        rows = []
    if target:
        rows = [r for r in rows if str(r.get("target_url") or "").lower().rstrip("/") == target]
    sliced = cap_list(rows, limit, max_cap=200)
    return {"rows": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_nofollow_internal_links(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "links": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 50, 100)
    edges = payload.get("link_edges") or []
    items = [
        e for e in (edges if isinstance(edges, list) else [])
        if isinstance(e, dict)
        and e.get("link_type") == "internal"
        and e.get("is_nofollow")
    ]
    sliced = cap_list(items, limit, max_cap=100)
    return {"links": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}
