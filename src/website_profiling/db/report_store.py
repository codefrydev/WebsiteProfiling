"""Report payload read/write."""
from __future__ import annotations

from typing import Any, Optional
from urllib.parse import urlparse

from psycopg import Connection

from ..scoring import round_half_up
from ._common import _json_val, _now_iso, _parse_row_json, _row_field
from .crawl_store import get_crawl_run_info


def _extract_hostname(url: str) -> str:
    try:
        host = urlparse(str(url or "")).hostname
        return host.lower() if host else ""
    except Exception:
        return ""


def _canonical_domain_from_report(conn: Connection, report_data: dict[str, Any]) -> str:
    run_id = report_data.get("crawl_run_id")
    start_url = ""
    if run_id is not None:
        info = get_crawl_run_info(conn, int(run_id))
        if info:
            start_url = str(info.get("start_url") or "")
    top_pages = report_data.get("top_pages") or []
    fallback_url = ""
    if top_pages and isinstance(top_pages[0], dict):
        fallback_url = str(top_pages[0].get("url") or "")
    if not fallback_url:
        links = report_data.get("links") or []
        if links and isinstance(links[0], dict):
            fallback_url = str(links[0].get("url") or "")
    return _extract_hostname(start_url) or _extract_hostname(fallback_url)


def _write_audit_health_snapshot(
    conn: Connection,
    report_id: int,
    canonical_domain: str,
    report_data: dict[str, Any],
) -> None:
    """Persist health score row for portfolio sparklines and alerts."""
    import json

    categories = report_data.get("categories") or []
    scores = [
        float(c.get("score"))
        for c in categories
        if isinstance(c, dict) and isinstance(c.get("score"), (int, float))
    ]
    health_score = round_half_up(sum(scores) / len(scores)) if scores else None
    category_scores: dict[str, float] = {}
    issue_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for cat in categories:
        if not isinstance(cat, dict):
            continue
        key = str(cat.get("id") or cat.get("name") or "unknown")
        if isinstance(cat.get("score"), (int, float)):
            category_scores[key] = float(cat["score"])
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            p = str(issue.get("priority") or "Medium")
            issue_counts[p] = issue_counts.get(p, 0) + 1
    property_id = report_data.get("property_id")
    try:
        property_id = int(property_id) if property_id is not None else None
    except (TypeError, ValueError):
        property_id = None
    conn.execute(
        """INSERT INTO audit_health_snapshots
             (property_id, report_id, canonical_domain, health_score, category_scores, issue_counts, generated_at)
           VALUES (%s, %s, %s, %s, %s, %s, now())""",
        (
            property_id,
            report_id,
            canonical_domain or None,
            health_score,
            json.dumps(category_scores),
            json.dumps(issue_counts),
        ),
    )


def write_report_payload(conn: Connection, report_data: dict[str, Any]) -> None:
    site_name = str(report_data.get("site_name") or "")
    canonical_domain = _canonical_domain_from_report(conn, report_data)
    cur = conn.execute(
        """INSERT INTO report_payload (generated_at, site_name, canonical_domain, data)
           VALUES (%s, %s, %s, %s) RETURNING id""",
        (_now_iso(), site_name, canonical_domain, _json_val(report_data)),
    )
    row = cur.fetchone()
    rid = _row_field(row, "id", index=0)
    report_id = int(rid) if rid is not None else None
    if report_id is not None:
        try:
            _write_audit_health_snapshot(conn, report_id, canonical_domain, report_data)
        except Exception:
            pass
    conn.commit()


def read_report_payload(conn: Connection, report_id: Optional[int] = None) -> Optional[dict[str, Any]]:
    try:
        if report_id is not None:
            cur = conn.execute(
                "SELECT data FROM report_payload WHERE id = %s",
                (int(report_id),),
            )
        else:
            cur = conn.execute("SELECT data FROM report_payload ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_row_json(row)
        return data if isinstance(data, dict) else None
    except Exception:
        return None
