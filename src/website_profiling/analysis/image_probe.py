"""Probe image URLs for Content-Type and size (HEAD with GET fallback)."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any
from urllib.parse import urlparse

import requests

_PARTIAL_GET_CAP = 65536
_USER_AGENT = "WebsiteProfilingImageProbe/1.0"


def _normalize_image_url(url: str) -> str | None:
    raw = str(url or "").strip()
    if not raw or raw.lower().startswith("data:"):
        return None
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https"):
        return None
    return raw.split("#", 1)[0]


def _parse_size(headers: dict[str, Any]) -> int | None:
    cl = headers.get("Content-Length") or headers.get("content-length")
    if cl is None:
        return None
    try:
        return int(cl)
    except (TypeError, ValueError):
        return None


def _probe_one(url: str, *, timeout: int, session: requests.Session) -> dict[str, Any]:
    result: dict[str, Any] = {
        "url": url,
        "status": None,
        "content_type": None,
        "size_bytes": None,
        "error": None,
    }
    try:
        resp = session.head(url, timeout=timeout, allow_redirects=True)
        if resp.status_code in (405, 501, 403):
            resp = session.get(url, timeout=timeout, allow_redirects=True, stream=True)
            size = _parse_size(resp.headers)
            if size is None:
                read = 0
                for chunk in resp.iter_content(chunk_size=8192):
                    if not chunk:
                        break
                    read += len(chunk)
                    if read >= _PARTIAL_GET_CAP:
                        size = read
                        break
                else:
                    size = read if read else None
            result["status"] = resp.status_code
            result["content_type"] = (resp.headers.get("Content-Type") or "").split(";")[0].strip() or None
            result["size_bytes"] = size
            resp.close()
            return result
        result["status"] = resp.status_code
        result["content_type"] = (resp.headers.get("Content-Type") or "").split(";")[0].strip() or None
        result["size_bytes"] = _parse_size(resp.headers)
        if result["size_bytes"] is None and resp.status_code == 200:
            resp2 = session.get(url, timeout=timeout, allow_redirects=True, stream=True)
            read = 0
            for chunk in resp2.iter_content(chunk_size=8192):
                if not chunk:
                    break
                read += len(chunk)
                if read >= _PARTIAL_GET_CAP:
                    break
            result["size_bytes"] = read if read else None
            resp2.close()
    except Exception as exc:
        result["error"] = str(exc)[:200]
    return result


def probe_image_urls(
    urls: list[str],
    *,
    concurrency: int = 6,
    timeout: int = 8,
    session: requests.Session | None = None,
) -> list[dict[str, Any]]:
    """Return probe results for each unique http(s) image URL."""
    seen: set[str] = set()
    unique: list[str] = []
    for raw in urls:
        norm = _normalize_image_url(raw)
        if not norm or norm in seen:
            continue
        seen.add(norm)
        unique.append(norm)

    owns = session is None
    sess = session or requests.Session()
    if owns:
        sess.headers.update({"User-Agent": _USER_AGENT})

    results: list[dict[str, Any]] = []
    workers = max(1, min(concurrency, 20))
    try:
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_probe_one, u, timeout=timeout, session=sess): u for u in unique}
            for fut in as_completed(futures):
                results.append(fut.result())
    finally:
        if owns:
            sess.close()
    return results


def collect_image_refs_from_links(links: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    """Map image URL -> { source_pages: set, kinds: set }."""
    out: dict[str, dict[str, Any]] = {}

    def _add(raw: str | None, page_url: str, kind: str) -> None:
        norm = _normalize_image_url(str(raw or ""))
        if not norm or not page_url:
            return
        if norm not in out:
            out[norm] = {"source_pages": set(), "kinds": set()}
        out[norm]["source_pages"].add(page_url)
        out[norm]["kinds"].add(kind)

    for link in links:
        if not isinstance(link, dict):
            continue
        page_url = str(link.get("url") or "").strip()
        if not page_url:
            continue
        pa = link.get("page_analysis")
        if isinstance(pa, dict):
            for u in pa.get("image_urls") or []:
                _add(str(u), page_url, "content")
        _add(link.get("og_image"), page_url, "og")
        _add(link.get("twitter_image"), page_url, "twitter")
    return out
