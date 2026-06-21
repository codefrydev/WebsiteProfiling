"""Extra export and validation MCP tools."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ....integrations.google.rich_results import validate_urls
from ....tools.export_sitemap import build_sitemap_xml
from ...export_artifacts import save_artifact
from ..context import AuditToolContext


def export_sitemap_xml(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    payload = ctx.load_payload(conn)
    if not payload:
        return {"error": "report not found"}
    xml = build_sitemap_xml(payload)
    artifact = save_artifact(
        xml,
        filename="sitemap.xml",
        mime_type="application/xml",
    )
    return {**artifact, "url_count": xml.count("<loc>")}


def validate_rich_results(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    payload = ctx.load_payload(conn)
    if not payload:
        return {"error": "report not found"}
    link_rows = [l for l in (payload.get("links") or []) if isinstance(l, dict)]
    urls = [str(l.get("url") or "") for l in link_rows]
    urls = [u for u in urls if u][: int(args.get("limit") or 50)]
    links_by_url = {str(l.get("url") or ""): l for l in link_rows if l.get("url")}
    creds = None
    site_url = str(args.get("site_url") or args.get("gsc_site_url") or "").strip() or None
    if ctx.property_id:
        try:
            from ....integrations.google.auth import build_credentials

            creds = build_credentials(ctx.property_id)
        except Exception:
            creds = None
    rows = validate_urls(urls, creds=creds, site_url=site_url, links_by_url=links_by_url)
    provenance = rows[0]["provenance"] if rows else "Estimated"
    return {"rows": rows, "count": len(rows), "provenance": provenance}
