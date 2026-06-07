"""Integration alerts and ops tools."""
from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

from ...db._common import _row_field
from ...db.property_store import get_property_by_id
from ...tools.alert_checker import check_all_alerts
from ._slice import parse_limit
from .context import AuditToolContext


def get_integration_alerts(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    alerts = check_all_alerts(int(scoped.property_id))
    return {"alerts": alerts, "count": len(alerts), "property_id": scoped.property_id}


def get_property_ops(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    cur = conn.execute(
        """SELECT schedule_cron, alert_webhook_url, alert_email
           FROM properties WHERE id = %s""",
        (int(scoped.property_id),),
    )
    row = cur.fetchone()
    if not row:
        return {"error": "property not found"}
    return {
        "property_id": scoped.property_id,
        "schedule_cron": _row_field(row, "schedule_cron", index=0),
        "alert_webhook_url": _row_field(row, "alert_webhook_url", index=1),
        "alert_email": _row_field(row, "alert_email", index=2),
        "has_schedule": bool(str(_row_field(row, "schedule_cron", index=0) or "").strip()),
        "has_alert_webhook": bool(str(_row_field(row, "alert_webhook_url", index=1) or "").strip()),
    }


def get_google_integration_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    prop = get_property_by_id(conn, int(scoped.property_id))
    if not prop:
        return {"error": "property not found"}
    google = scoped.load_google(conn)
    gsc_links_status = None
    try:
        from ...integrations.google.gsc_links_store import read_gsc_links_status
        gsc_links_status = read_gsc_links_status(conn, int(scoped.property_id))
    except Exception:
        gsc_links_status = None
    return {
        "property_id": scoped.property_id,
        "google_connected": bool(prop.get("google_refresh_token")),
        "google_connected_at": prop.get("google_connected_at"),
        "google_connected_email": prop.get("google_connected_email"),
        "gsc_site_url": prop.get("gsc_site_url"),
        "ga4_property_id": prop.get("ga4_property_id"),
        "google_date_range_days": prop.get("google_date_range_days"),
        "google_data_fetched_at": (google or {}).get("fetched_at"),
        "gsc_links": gsc_links_status,
    }


def list_crawl_runs(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    limit = parse_limit(args.get("limit"), 20, 50)
    params: list[Any] = []
    where = ""
    if scoped.property_id is not None:
        where = "WHERE property_id = %s"
        params.append(int(scoped.property_id))
    params.append(limit)
    cur = conn.execute(
        f"""SELECT id, created_at, start_url, render_mode, property_id
            FROM crawl_runs {where}
            ORDER BY id DESC
            LIMIT %s""",
        tuple(params),
    )
    runs = []
    for row in cur.fetchall() or []:
        created = _row_field(row, "created_at", index=1)
        runs.append({
            "id": _row_field(row, "id", index=0),
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
            "start_url": _row_field(row, "start_url", index=2),
            "render_mode": _row_field(row, "render_mode", index=3),
            "property_id": _row_field(row, "property_id", index=4),
        })
    return {"runs": runs, "count": len(runs)}


def list_log_uploads(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    limit = parse_limit(args.get("limit"), 10, 30)
    cur = conn.execute(
        """SELECT id, filename, line_count, uploaded_at
           FROM log_file_uploads
           WHERE property_id = %s
           ORDER BY uploaded_at DESC
           LIMIT %s""",
        (int(scoped.property_id), limit),
    )
    uploads = []
    for row in cur.fetchall() or []:
        uploaded = _row_field(row, "uploaded_at", index=3)
        uploads.append({
            "id": _row_field(row, "id", index=0),
            "filename": _row_field(row, "filename", index=1),
            "line_count": _row_field(row, "line_count", index=2),
            "uploaded_at": uploaded.isoformat() if hasattr(uploaded, "isoformat") else str(uploaded or ""),
        })
    return {"uploads": uploads, "count": len(uploads), "property_id": scoped.property_id}


def get_latest_log_analysis(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    cur = conn.execute(
        """SELECT filename, line_count, analysis, uploaded_at
           FROM log_file_uploads
           WHERE property_id = %s
           ORDER BY uploaded_at DESC
           LIMIT 1""",
        (int(scoped.property_id),),
    )
    row = cur.fetchone()
    if not row:
        return {"error": "no log uploads found", "missing": True}
    analysis = _row_field(row, "analysis", index=2)
    if isinstance(analysis, str):
        try:
            analysis = json.loads(analysis)
        except json.JSONDecodeError:
            analysis = {}
    uploaded = _row_field(row, "uploaded_at", index=3)
    return {
        "filename": _row_field(row, "filename", index=0),
        "line_count": _row_field(row, "line_count", index=1),
        "analysis": analysis if isinstance(analysis, dict) else {},
        "uploaded_at": uploaded.isoformat() if hasattr(uploaded, "isoformat") else str(uploaded or ""),
        "property_id": scoped.property_id,
    }
