"""Discover URLs from robots.txt and sitemap.xml for crawl seeding."""

from __future__ import annotations

import xml.etree.ElementTree as ET
from urllib.parse import urlparse

import requests

from ..common import normalize_link

_USER_AGENT = "WebsiteProfilingCrawler/1.0"
_MAX_SITEMAP_URLS = 5000


def _origin(start_url: str) -> str:
    parsed = urlparse(start_url)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


def _same_origin(url: str, origin: str) -> bool:
    """True when *url* is on the same host as *origin* (the crawl start host)."""
    return bool(url) and urlparse(url).netloc == urlparse(origin).netloc


def _sitemap_urls_from_robots(text: str) -> list[str]:
    urls: list[str] = []
    for line in text.splitlines():
        line = line.strip()
        if line.lower().startswith("sitemap:"):
            part = line.split(":", 1)[1].strip()
            if part:
                urls.append(part)
    return urls


def _parse_sitemap_xml(content: str, base_url: str) -> tuple[list[str], list[str]]:
    """Return (page_urls, nested_sitemap_urls)."""
    page_urls: list[str] = []
    nested: list[str] = []
    try:
        root = ET.fromstring(content)
    except ET.ParseError:
        return page_urls, nested

    tag = root.tag.lower()
    if tag.endswith("sitemapindex"):
        for loc in root.iter():
            if loc.tag.lower().endswith("loc") and loc.text:
                nested.append(loc.text.strip())
    elif tag.endswith("urlset"):
        for url_el in root.iter():
            if not url_el.tag.lower().endswith("url"):
                continue
            for loc in url_el:
                if loc.tag.lower().endswith("loc") and loc.text:
                    normalized = normalize_link(base_url, loc.text.strip())
                    if normalized:
                        page_urls.append(normalized)
                    break
    return page_urls, nested


def discover_sitemap_urls(
    start_url: str,
    *,
    timeout: int = 12,
    max_urls: int = _MAX_SITEMAP_URLS,
    session: requests.Session | None = None,
) -> list[str]:
    """Collect same-origin page URLs from robots.txt and sitemap chain."""
    origin = _origin(start_url)
    if not origin:
        return []

    sess = session or requests.Session()
    owns_session = session is None
    if owns_session:
        sess.headers.update({"User-Agent": _USER_AGENT})

    sitemap_queue: list[str] = []
    seen_sitemaps: set[str] = set()
    found: list[str] = []
    seen_pages: set[str] = set()

    try:
        try:
            r = sess.get(f"{origin}/robots.txt", timeout=timeout)
            if r.status_code == 200 and r.text:
                # Only follow same-origin sitemaps: robots.txt (or a MITM of it)
                # can advertise arbitrary hosts, which would otherwise let the
                # crawler issue requests off the audited origin (SSRF / scope escape).
                sitemap_queue.extend(
                    s for s in _sitemap_urls_from_robots(r.text) if _same_origin(s, origin)
                )
        except Exception:
            pass

        if not sitemap_queue:
            sitemap_queue.append(f"{origin}/sitemap.xml")

        while sitemap_queue and len(found) < max_urls:
            sm_url = sitemap_queue.pop(0).strip()
            if not sm_url or sm_url in seen_sitemaps:
                continue
            seen_sitemaps.add(sm_url)
            try:
                r = sess.get(sm_url, timeout=timeout)
                if r.status_code != 200 or not r.text or "<" not in r.text:
                    continue
                pages, nested = _parse_sitemap_xml(r.text, sm_url)
                for n in nested:
                    # Nested <sitemap><loc> entries are attacker-controllable;
                    # never queue an off-origin sitemap for fetching.
                    if n not in seen_sitemaps and _same_origin(n, origin):
                        sitemap_queue.append(n)
                for page in pages:
                    if not _same_origin(page, origin):
                        continue
                    if page not in seen_pages:
                        seen_pages.add(page)
                        found.append(page)
                        if len(found) >= max_urls:
                            break
            except Exception:
                continue
    finally:
        if owns_session:
            sess.close()

    return found
