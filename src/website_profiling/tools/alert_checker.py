"""Alert rules: health score drop, new critical issues."""
from __future__ import annotations

import json
import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Any

logger = logging.getLogger(__name__)


def _env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None or str(raw).strip() == "":
        return default
    return str(raw).strip().lower() in ("1", "true", "yes", "on")


def smtp_configured() -> bool:
    host = (os.environ.get("SMTP_HOST") or "").strip()
    from_addr = (os.environ.get("SMTP_FROM") or "").strip()
    return bool(host and from_addr)


def _format_alert_email_body(payload: dict[str, Any]) -> str:
    lines = ["Site Audit property alerts", ""]
    prop_id = payload.get("property_id")
    if prop_id is not None:
        lines.append(f"Property ID: {prop_id}")
        lines.append("")
    alerts = payload.get("alerts") or []
    if not alerts:
        lines.append("No alerts.")
        return "\n".join(lines)
    for i, alert in enumerate(alerts, start=1):
        if not isinstance(alert, dict):
            continue
        severity = alert.get("severity") or "info"
        msg = alert.get("message") or alert.get("type") or "Alert"
        lines.append(f"{i}. [{severity}] {msg}")
    return "\n".join(lines)


def dispatch_email(to: str, payload: dict[str, Any]) -> bool:
    """Send alert summary via SMTP. Returns False when unconfigured or on failure."""
    recipient = (to or "").strip()
    if not recipient:
        return False
    if not smtp_configured():
        logger.info("SMTP not configured (SMTP_HOST and SMTP_FROM required); skipping alert email")
        return False

    host = os.environ.get("SMTP_HOST", "").strip()
    port = int(os.environ.get("SMTP_PORT") or "587")
    user = (os.environ.get("SMTP_USER") or "").strip()
    password = os.environ.get("SMTP_PASS") or ""
    from_addr = os.environ.get("SMTP_FROM", "").strip()
    use_tls = _env_bool("SMTP_USE_TLS", True)

    msg = EmailMessage()
    msg["Subject"] = "Site Audit alerts"
    msg["From"] = from_addr
    msg["To"] = recipient
    msg.set_content(_format_alert_email_body(payload))

    try:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            if use_tls:
                smtp.starttls()
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send alert email to %s", recipient)
        return False


def check_health_alerts(property_id: int, threshold_drop: int = 10) -> list[dict[str, Any]]:
    from ..db.storage import db_session

    alerts: list[dict[str, Any]] = []
    with db_session() as conn:
        cur = conn.execute(
            """SELECT health_score, generated_at FROM audit_health_snapshots
               WHERE property_id = %s ORDER BY generated_at DESC, id DESC LIMIT 2""",
            (property_id,),
        )
        rows = cur.fetchall() or []
        if len(rows) < 2:
            return alerts
        latest = rows[0][0] if not hasattr(rows[0], "keys") else rows[0]["health_score"]
        prev = rows[1][0] if not hasattr(rows[1], "keys") else rows[1]["health_score"]
        if latest is None or prev is None:
            return alerts
        drop = int(prev) - int(latest)
        if drop >= threshold_drop:
            alerts.append({
                "type": "health_drop",
                "property_id": property_id,
                "message": f"Health score dropped {drop} points ({prev} → {latest})",
                "severity": "high",
            })
    return alerts


def check_gsc_links_stale_alerts(property_id: int, max_age_days: int = 7) -> list[dict[str, Any]]:
    from ..integrations.google.gsc_links_sync import check_stale_gsc_links_imports

    alerts: list[dict[str, Any]] = []
    for item in check_stale_gsc_links_imports(max_age_days=max_age_days):
        if int(item.get("property_id") or 0) != int(property_id):
            continue
        alerts.append({
            "type": "gsc_links_stale",
            "property_id": property_id,
            "message": str(item.get("message") or "GSC Links import is stale."),
            "severity": item.get("severity") or "low",
        })
    return alerts


def check_all_alerts(property_id: int) -> list[dict[str, Any]]:
    return check_health_alerts(property_id) + check_gsc_links_stale_alerts(property_id)


def dispatch_webhook(url: str, payload: dict[str, Any]) -> bool:
    import urllib.request

    if not url.strip():
        return False
    try:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15):
            return True
    except Exception:
        return False
