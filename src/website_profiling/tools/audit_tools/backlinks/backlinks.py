"""Backlinks and competitor link gap tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ....integrations.google.gsc_links_store import read_gsc_links_status
from .._slice import cap_list, parse_limit, payload_dict_slice
from ..context import AuditToolContext


def get_gsc_links_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required for GSC links data"}
    data = scoped.load_gsc_links(conn)
    if not data:
        return {"error": "no GSC links data — import GSC Links CSV in Integrations", "missing": True}
    limit = parse_limit(args.get("limit"), 20, 50)
    out = {
        "imported_at": data.get("imported_at"),
        "export_types": data.get("export_types") or [],
        "row_counts": data.get("row_counts") or {},
        "top_linking_sites": cap_list(list(data.get("top_linking_sites") or []), limit, max_cap=50)["items"],
        "top_linked_pages": cap_list(list(data.get("top_linked_pages") or []), limit, max_cap=50)["items"],
        "sample_links_full_count": data.get("sample_links_full_count"),
        "latest_links_full_count": data.get("latest_links_full_count"),
        "property_id": scoped.property_id,
    }
    return out


def get_gsc_links_import_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    return read_gsc_links_status(conn, int(scoped.property_id))


def get_competitor_link_gap(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    gap = payload.get("competitor_link_gap")
    if not isinstance(gap, dict):
        return {"error": "competitor_link_gap not in report — configure competitor_domains and import GSC links", "missing": True}
    return {"competitor_link_gap": gap}


def get_bing_backlinks_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "bing_backlinks")


def get_gsc_sample_links(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    data = scoped.load_gsc_links(conn)
    if not data:
        return {"error": "no GSC links data", "missing": True, "links": [], "total": 0, "truncated": False}
    links = list(data.get("sample_links") or [])
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(links, limit, max_cap=100)
    return {
        "links": sliced["items"],
        "total": data.get("sample_links_full_count") or sliced["total"],
        "truncated": sliced["truncated"],
        "full_count": data.get("sample_links_full_count"),
    }


def get_gsc_latest_links(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    data = scoped.load_gsc_links(conn)
    if not data:
        return {"error": "no GSC links data", "missing": True, "links": [], "total": 0, "truncated": False}
    links = list(data.get("latest_links") or [])
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(links, limit, max_cap=100)
    return {
        "links": sliced["items"],
        "total": data.get("latest_links_full_count") or sliced["total"],
        "truncated": sliced["truncated"],
        "full_count": data.get("latest_links_full_count"),
    }


def get_third_party_links_overlay(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    data = scoped.load_gsc_links(conn)
    if not data:
        return {"error": "no GSC links data", "missing": True, "overlays": []}
    overlays = data.get("third_party_overlays") or []
    if not isinstance(overlays, list):
        overlays = []
    provider = str(args.get("provider") or "").strip().lower()
    if provider:
        overlays = [
            o for o in overlays
            if isinstance(o, dict) and str(o.get("provider") or "").lower() == provider
        ]
    return {"overlays": overlays, "count": len(overlays)}


def get_backlinks_velocity(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    limit = parse_limit(args.get("limit"), 52, 52)
    cur = conn.execute(
        """SELECT captured_at, referring_domains, top_domains
           FROM gsc_links_snapshots
           WHERE property_id = %s
           ORDER BY captured_at ASC
           LIMIT %s""",
        (int(scoped.property_id), limit),
    )
    snapshots = []
    for row in cur.fetchall() or []:
        captured = row["captured_at"] if hasattr(row, "keys") else row[0]
        domains = row["referring_domains"] if hasattr(row, "keys") else row[1]
        top = row["top_domains"] if hasattr(row, "keys") else row[2]
        snapshots.append({
            "captured_at": captured.isoformat() if hasattr(captured, "isoformat") else str(captured or ""),
            "referring_domains": domains,
            "top_domains": top,
        })
    return {"snapshots": snapshots, "count": len(snapshots), "property_id": scoped.property_id}
