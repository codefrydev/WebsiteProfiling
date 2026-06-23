"""Crawl routes: /api/crawl/*"""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from ..deps import get_db

router = APIRouter(tags=["crawl"])


@router.get("/crawl/browser-status")
def browser_status_check() -> dict[str, Any]:
    """Return whether Playwright + Chromium are available."""
    from website_profiling.crawl.fetchers import ensure_browser_deps

    return ensure_browser_deps()


@router.get("/crawl/page-html")
def get_page_html(
    conn: Annotated[Connection, Depends(get_db)],
    url: str = Query(..., description="Page URL to retrieve stored HTML for"),
    crawlRunId: Optional[int] = Query(None, description="Crawl run ID"),
) -> dict[str, Any]:
    """Return stored HTML and metadata for a URL within a crawl run."""
    from website_profiling.db.html_store import read_page_html

    if not crawlRunId:
        raise HTTPException(status_code=400, detail="crawlRunId is required")

    result = read_page_html(conn, crawlRunId, url)
    if result is None:
        raise HTTPException(
            status_code=404,
            detail=f"No stored HTML found for url={url!r} in crawlRunId={crawlRunId}",
        )
    return result
