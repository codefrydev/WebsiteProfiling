"""Integration alerts and ops tools."""
from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

from ...db._common import _row_field
from ...db.property_store import get_property_by_id
from ...tools.alert_checker import check_all_alerts
from ._slice import cap_list, parse_limit
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


def _parse_analysis_field(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else {}
        except json.JSONDecodeError:
            return {}
    return {}


def _load_log_analysis(
    conn: Connection,
    property_id: int,
    upload_id: int | None = None,
) -> dict[str, Any] | None:
    if upload_id is not None:
        cur = conn.execute(
            """SELECT id, filename, line_count, analysis, uploaded_at
               FROM log_file_uploads
               WHERE property_id = %s AND id = %s
               LIMIT 1""",
            (property_id, int(upload_id)),
        )
    else:
        cur = conn.execute(
            """SELECT id, filename, line_count, analysis, uploaded_at
               FROM log_file_uploads
               WHERE property_id = %s
               ORDER BY uploaded_at DESC
               LIMIT 1""",
            (property_id,),
        )
    row = cur.fetchone()
    if not row:
        return None
    uploaded = _row_field(row, "uploaded_at", index=4)
    return {
        "upload_id": _row_field(row, "id", index=0),
        "filename": _row_field(row, "filename", index=1),
        "line_count": _row_field(row, "line_count", index=2),
        "analysis": _parse_analysis_field(_row_field(row, "analysis", index=3)),
        "uploaded_at": uploaded.isoformat() if hasattr(uploaded, "isoformat") else str(uploaded or ""),
    }


def get_latest_log_analysis(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    row = _load_log_analysis(conn, int(scoped.property_id))
    if not row:
        return {"error": "no log uploads found", "missing": True}
    return {
        **row,
        "property_id": scoped.property_id,
    }


def get_log_analysis_by_id(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    upload_id = args.get("upload_id")
    if upload_id is None:
        return {"error": "upload_id is required"}
    try:
        uid = int(upload_id)
    except (TypeError, ValueError):
        return {"error": "invalid upload_id"}
    row = _load_log_analysis(conn, int(scoped.property_id), upload_id=uid)
    if not row:
        return {"error": "log upload not found", "missing": True}
    return {**row, "property_id": scoped.property_id}


def _log_compare_paths(analysis: dict[str, Any]) -> dict[str, list[str]]:
    compare = analysis.get("crawl_compare") if isinstance(analysis.get("crawl_compare"), dict) else {}
    log_only = compare.get("log_only_paths") or analysis.get("log_only_paths") or []
    crawl_only = compare.get("crawl_only_paths") or analysis.get("crawl_only_paths") or []
    return {
        "log_only_paths": [str(p) for p in log_only if p] if isinstance(log_only, list) else [],
        "crawl_only_paths": [str(p) for p in crawl_only if p] if isinstance(crawl_only, list) else [],
    }


def get_log_top_paths(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    row = _load_log_analysis(conn, int(scoped.property_id))
    if not row:
        return {"error": "no log uploads found", "missing": True, "paths": [], "total": 0, "truncated": False}
    analysis = row.get("analysis") or {}
    paths = analysis.get("top_paths") or []
    if not isinstance(paths, list):
        paths = []
    limit = parse_limit(args.get("limit"), 30, 100)
    sliced = cap_list(paths, limit, max_cap=100)
    return {
        "paths": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "upload_id": row.get("upload_id"),
        "filename": row.get("filename"),
    }


def list_log_only_paths(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    row = _load_log_analysis(conn, int(scoped.property_id))
    if not row:
        return {"error": "no log uploads found", "missing": True, "paths": [], "total": 0, "truncated": False}
    paths = _log_compare_paths(row.get("analysis") or {}).get("log_only_paths") or []
    limit = parse_limit(args.get("limit"), 50, 200)
    items = [{"path": p} for p in paths]
    sliced = cap_list(items, limit, max_cap=200)
    return {"paths": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def list_crawl_only_paths(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    row = _load_log_analysis(conn, int(scoped.property_id))
    if not row:
        return {"error": "no log uploads found", "missing": True, "paths": [], "total": 0, "truncated": False}
    paths = _log_compare_paths(row.get("analysis") or {}).get("crawl_only_paths") or []
    limit = parse_limit(args.get("limit"), 50, 200)
    items = [{"path": p} for p in paths]
    sliced = cap_list(items, limit, max_cap=200)
    return {"paths": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"]}


def get_log_googlebot_stats(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    row = _load_log_analysis(conn, int(scoped.property_id))
    if not row:
        return {"error": "no log uploads found", "missing": True}
    analysis = row.get("analysis") or {}
    parsed = int(analysis.get("parsed_lines") or 0)
    bot_hits = int(analysis.get("googlebot_hits") or 0)
    ratio = round(bot_hits / parsed, 4) if parsed > 0 else None
    return {
        "upload_id": row.get("upload_id"),
        "filename": row.get("filename"),
        "parsed_lines": parsed,
        "googlebot_hits": bot_hits,
        "googlebot_ratio": ratio,
        "unique_paths": analysis.get("unique_paths"),
        "status_counts": analysis.get("status_counts"),
    }
