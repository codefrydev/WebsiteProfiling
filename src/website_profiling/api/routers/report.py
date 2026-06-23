"""Report data routers — /api/report/*."""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from ..deps import get_db
from ..services.report_loader import (
    SECTION_KEYS,
    get_crawl_preview_payload,
    get_mobile_desktop_delta,
    get_report_payload,
    list_audit_history,
    list_crawl_runs,
    list_reports,
)

router = APIRouter(prefix="/report", tags=["report"])

DbDep = Annotated[Connection, Depends(get_db)]


@router.get("/meta")
def report_meta(conn: DbDep) -> dict[str, Any]:
    return {
        "reports": list_reports(conn),
        "crawlRuns": list_crawl_runs(conn),
    }


@router.get("/payload")
def report_payload(
    conn: DbDep,
    reportId: Optional[int] = Query(None),
    domain: Optional[str] = Query(None),
    section: Optional[str] = Query(None),
) -> dict[str, Any]:
    if section is not None and section not in SECTION_KEYS:
        raise HTTPException(status_code=400, detail="Invalid section")
    payload = get_report_payload(conn, reportId, domain, section)
    if payload is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if section:
        return {"payload": payload, "section": section}
    return {"payload": payload}


@router.get("/history")
def report_history(
    conn: DbDep,
    propertyId: Optional[int] = Query(None),
    domain: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    history = list_audit_history(conn, propertyId, domain, limit)
    return {"history": history}


@router.get("/crawl-payload")
def crawl_payload(
    conn: DbDep,
    crawlRunId: Optional[int] = Query(None),
) -> dict[str, Any]:
    if not crawlRunId or crawlRunId <= 0:
        raise HTTPException(status_code=400, detail="Invalid crawlRunId")
    try:
        payload = get_crawl_preview_payload(conn, crawlRunId)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"payload": payload}


@router.get("/mobile-delta")
def mobile_delta(
    conn: DbDep,
    id: Optional[int] = Query(None),
) -> dict[str, Any]:
    if not id:
        raise HTTPException(status_code=400, detail="id required")
    deltas = get_mobile_desktop_delta(conn, id)
    return {"deltas": deltas}
