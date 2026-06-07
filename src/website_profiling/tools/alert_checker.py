"""Alert rules: health score drop, new critical issues."""
from __future__ import annotations

import json
from typing import Any


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
