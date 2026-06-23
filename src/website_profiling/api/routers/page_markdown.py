"""Page markdown routers — /api/page-markdown/*."""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from psycopg import Connection

from ..deps import get_db
from website_profiling.db.markdown_store import (
    delete_page_markdown_for_run,
    list_markdown_crawl_runs,
    list_page_markdown,
    read_page_markdown,
)

router = APIRouter(prefix="/page-markdown", tags=["page-markdown"])

DbDep = Annotated[Connection, Depends(get_db)]


@router.get("")
def list_page_markdown_route(
    conn: DbDep,
    crawlRunId: int = Query(...),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    q: Optional[str] = Query(None),
) -> dict[str, Any]:
    if not crawlRunId:
        raise HTTPException(status_code=400, detail="crawlRunId required")

    page = max(1, page)
    page_size = min(100, max(1, limit))
    offset = (page - 1) * page_size

    try:
        result = list_page_markdown(
            conn,
            crawlRunId,
            limit=page_size,
            offset=offset,
            query=(q or "").strip(),
        )
        items = []
        for row in result.get("items") or []:
            extracted = row.get("extracted_at")
            items.append({
                "url": row.get("url"),
                "title": row.get("title"),
                "word_count": row.get("word_count"),
                "strategy": row.get("strategy"),
                "extracted_at": str(extracted) if extracted else None,
            })
        total = int(result.get("total") or 0)
        return {
            "items": items,
            "total": total,
            "page": page,
            "pageSize": page_size,
            "totalPages": max(1, -(-total // page_size)),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.delete("")
def delete_page_markdown_route(
    conn: DbDep,
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    crawl_run_id = int(body.get("crawlRunId") or 0)
    if not crawl_run_id:
        raise HTTPException(status_code=400, detail="crawlRunId required")

    try:
        deleted = delete_page_markdown_for_run(conn, crawl_run_id)
        return {"ok": True, "crawlRunId": crawl_run_id, "deletedRows": deleted}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/content")
def page_markdown_content_route(
    conn: DbDep,
    crawlRunId: int = Query(...),
    url: str = Query(...),
) -> dict[str, Any]:
    if not crawlRunId:
        raise HTTPException(status_code=400, detail="crawlRunId required")
    if not url:
        raise HTTPException(status_code=400, detail="url required")

    try:
        content = read_page_markdown(conn, crawlRunId, url)
        if not content:
            raise HTTPException(status_code=404, detail="Not found")
        extracted = content.get("extracted_at")
        return {
            "content": {
                "url": content.get("url"),
                "title": content.get("title"),
                "markdown": content.get("markdown"),
                "word_count": content.get("word_count"),
                "strategy": content.get("strategy"),
                "source_byte_length": content.get("source_byte_length"),
                "extracted_at": str(extracted) if extracted else None,
            }
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/extract")
def page_markdown_extract(
    conn: DbDep,
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    crawl_run_id = int(body.get("crawlRunId") or 0)
    if not crawl_run_id:
        raise HTTPException(status_code=400, detail="crawlRunId required")

    strategy = "full_body" if body.get("strategy") == "full_body" else "main_only"
    overwrite = body.get("overwrite", True)
    workers = min(16, max(1, int(body.get("workers") or 4)))

    command = f"page-markdown --crawl-run-id {crawl_run_id} --strategy {strategy} --workers {workers}"
    if not overwrite:
        command += " --no-overwrite"

    try:
        from website_profiling.db.pipeline_jobs import enqueue_job
        import uuid

        job_id = str(uuid.uuid4())
        ok = enqueue_job(conn, job_id, "page-markdown", command, None, None)
        if not ok:
            raise HTTPException(status_code=400, detail="A pipeline job is already running")
        return {"jobId": job_id, "crawlRunId": crawl_run_id, "strategy": strategy, "overwrite": overwrite}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/runs")
def page_markdown_runs_route(
    conn: DbDep,
    propertyId: Optional[int] = Query(None),
) -> dict[str, Any]:
    try:
        runs = list_markdown_crawl_runs(conn, propertyId)
        return {"runs": runs}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
