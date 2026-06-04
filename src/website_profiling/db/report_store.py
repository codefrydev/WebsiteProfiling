"""Report payload read/write."""
from __future__ import annotations

from typing import Any, Optional
from urllib.parse import urlparse

from psycopg import Connection

from ._common import _json_val, _now_iso, _parse_row_json
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


def write_report_payload(conn: Connection, report_data: dict[str, Any]) -> None:
    site_name = str(report_data.get("site_name") or "")
    canonical_domain = _canonical_domain_from_report(conn, report_data)
    conn.execute(
        """INSERT INTO report_payload (generated_at, site_name, canonical_domain, data)
           VALUES (%s, %s, %s, %s)""",
        (_now_iso(), site_name, canonical_domain, _json_val(report_data)),
    )
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
