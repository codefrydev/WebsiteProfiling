"""Batch content analysis for a crawl run."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Iterator

from psycopg import Connection

from ..db.html_store import read_page_html_for_run
from .page import ContentStrategy, analyze_page_html
from .plain_text import analyze_plain_text

_PAGE_BATCH = 500


def iter_html_pages(conn: Connection, crawl_run_id: int) -> Iterator[dict[str, Any]]:
    offset = 0
    while True:
        chunk = list(read_page_html_for_run(conn, crawl_run_id, limit=_PAGE_BATCH, offset=offset))
        if not chunk:
            break
        for row in chunk:
            yield row
        if len(chunk) < _PAGE_BATCH:
            break
        offset += _PAGE_BATCH


def _analyze_row(
    row: dict[str, Any],
    *,
    excerpt_max_chars: int,
    strategy: ContentStrategy,
    main_content_selectors: str | None = None,
    boilerplate_selectors: str | None = None,
) -> dict[str, Any] | None:
    html = row.get("html")
    url = row.get("url")
    if not url or not html:
        return None
    is_pdf = "pdf" in str(row.get("content_type") or "").lower()
    try:
        fields = (
            analyze_plain_text(str(html), excerpt_max_chars=excerpt_max_chars)
            if is_pdf
            else analyze_page_html(
                str(html),
                excerpt_max_chars=excerpt_max_chars,
                strategy=strategy,
                main_content_selectors=main_content_selectors,
                boilerplate_selectors=boilerplate_selectors,
            )
        )
    except Exception:
        # A single page whose HTML breaks the analysis stack must not abort the
        # whole run (mirrors page_markdown.batch._extract_row); skip it instead.
        return None
    return {"url": str(url), **fields}


def analyze_run_html(
    conn: Connection,
    crawl_run_id: int,
    *,
    excerpt_max_chars: int = 0,
    strategy: ContentStrategy = "main_only",
    workers: int = 4,
    main_content_selectors: str | None = None,
    boilerplate_selectors: str | None = None,
) -> list[dict[str, Any]]:
    """Analyze all stored HTML for a crawl run; returns merge payloads keyed by url."""
    rows = list(iter_html_pages(conn, crawl_run_id))
    if not rows:
        return []

    worker_count = max(1, int(workers))
    if worker_count == 1 or len(rows) == 1:
        out: list[dict[str, Any]] = []
        for row in rows:
            merged = _analyze_row(
                row,
                excerpt_max_chars=excerpt_max_chars,
                strategy=strategy,
                main_content_selectors=main_content_selectors,
                boilerplate_selectors=boilerplate_selectors,
            )
            if merged:
                out.append(merged)
        return out

    results: list[dict[str, Any]] = []
    with ThreadPoolExecutor(max_workers=worker_count) as pool:
        futures = [
            pool.submit(
                _analyze_row,
                row,
                excerpt_max_chars=excerpt_max_chars,
                strategy=strategy,
                main_content_selectors=main_content_selectors,
                boilerplate_selectors=boilerplate_selectors,
            )
            for row in rows
        ]
        for fut in as_completed(futures):
            merged = fut.result()
            if merged:
                results.append(merged)
    return results
