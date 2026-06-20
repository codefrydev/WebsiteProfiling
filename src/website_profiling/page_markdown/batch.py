"""Batch markdown extraction for a crawl run."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from psycopg import Connection

from ..content_analysis.batch import iter_html_pages
from ..content_analysis.main_content import ContentStrategy
from .page import extract_page_markdown


def _extract_row(
    row: dict[str, Any],
    *,
    strategy: ContentStrategy,
) -> dict[str, Any] | None:
    html = row.get("html")
    url = row.get("url")
    if not url or not html:
        return None
    try:
        fields = extract_page_markdown(str(html), strategy=strategy)
    except Exception:
        return None
    return {"url": str(url).rstrip("/"), **fields}


def extract_run_markdown(
    conn: Connection,
    crawl_run_id: int,
    *,
    strategy: ContentStrategy = "main_only",
    workers: int = 4,
    overwrite: bool = True,
) -> list[dict[str, Any]]:
    """Extract markdown for all stored HTML in a crawl run. Returns list of result dicts keyed by url."""
    from ..db.markdown_store import list_page_markdown

    rows = list(iter_html_pages(conn, crawl_run_id))
    if not rows:
        return []

    # If not overwriting, skip URLs already extracted
    if not overwrite:
        # Fetch all existing URLs with pagination. list_page_markdown clamps its
        # limit to a server-side max of 200, so page_limit must match that cap and
        # the loop must advance by the number of items actually returned.
        all_existing_urls: set[str] = set()
        page_offset = 0
        page_limit = 200
        while True:
            batch = list_page_markdown(conn, crawl_run_id, limit=page_limit, offset=page_offset)
            items = batch["items"]
            if not items:
                break
            for item in items:
                all_existing_urls.add(str(item.get("url", "")).rstrip("/"))
            page_offset += len(items)
            if len(items) < page_limit:
                break
        rows = [r for r in rows if str(r.get("url", "")).rstrip("/") not in all_existing_urls]
        if not rows:
            return []

    worker_count = max(1, int(workers))
    if worker_count == 1 or len(rows) == 1:
        results: list[dict[str, Any]] = []
        for row in rows:
            result = _extract_row(row, strategy=strategy)
            if result:
                results.append(result)
        return results

    results = []
    with ThreadPoolExecutor(max_workers=worker_count) as pool:
        futures = [pool.submit(_extract_row, row, strategy=strategy) for row in rows]
        for fut in as_completed(futures):
            result = fut.result()
            if result:
                results.append(result)
    return results
