"""Generate XML sitemap from crawled indexable URLs."""
from __future__ import annotations

from typing import Any, Optional
from xml.sax.saxutils import escape


def export_sitemap(report_id: Optional[int] = None) -> str:
    """Load a report payload from the DB and render it as a sitemap.

    Mirrors export_audit's self-loading wrapper (opens its own db_session so
    tests can patch it) and keeps build_sitemap_xml a pure transform.
    """
    from ..db import db_session, read_report_payload

    with db_session() as conn:
        payload = read_report_payload(conn, report_id)
    if not payload:
        raise FileNotFoundError("No report payload found")
    return build_sitemap_xml(payload)


def build_sitemap_xml(report_payload: dict[str, Any], *, max_urls: int = 50000) -> str:
    urls: list[str] = []
    for row in report_payload.get("links") or []:
        if not isinstance(row, dict):
            continue
        if row.get("noindex"):
            continue
        status = str(row.get("status") or "")
        if not status.startswith("2"):
            continue
        u = str(row.get("url") or "").strip()
        if u:
            urls.append(u)
    urls = urls[: max(1, int(max_urls))]
    body = "\n".join(f"  <url><loc>{escape(u)}</loc></url>" for u in urls)
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{body}\n"
        "</urlset>\n"
    )
