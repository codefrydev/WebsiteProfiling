"""Generate XML sitemap from crawled indexable URLs."""
from __future__ import annotations

from typing import Any
from xml.sax.saxutils import escape


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
