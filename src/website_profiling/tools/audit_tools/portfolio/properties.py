"""Property query tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ....db.property_store import get_property_by_id, list_properties_public
from ..context import AuditToolContext


def _public_property_row(prop: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": prop.get("id"),
        "name": prop.get("name"),
        "canonical_domain": prop.get("canonical_domain"),
        "site_url": prop.get("site_url"),
        "gsc_site_url": prop.get("gsc_site_url"),
        "ga4_property_id": prop.get("ga4_property_id"),
        "google_auth_mode": prop.get("google_auth_mode"),
        "google_connected": prop.get("google_connected") or bool(prop.get("google_connected_at")),
        "google_connected_at": prop.get("google_connected_at"),
        "google_connected_email": prop.get("google_connected_email"),
        "google_date_range_days": prop.get("google_date_range_days"),
        "crawl_authorized_at": prop.get("crawl_authorized_at"),
    }


def list_properties(conn: Connection, _ctx: AuditToolContext, _args: dict[str, Any]) -> dict[str, Any]:
    rows = list_properties_public(conn)
    return {"properties": rows, "count": len(rows)}


def get_property(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    property_id = args.get("property_id") or ctx.property_id
    if property_id is None:
        return {"error": "property_id is required"}
    try:
        pid = int(property_id)
    except (TypeError, ValueError):
        return {"error": "invalid property_id"}
    prop = get_property_by_id(conn, pid)
    if not prop:
        return {"error": f"property {pid} not found"}
    return {"property": _public_property_row(prop)}
