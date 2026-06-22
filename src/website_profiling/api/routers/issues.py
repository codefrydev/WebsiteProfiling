"""Issues routers — /api/issues/* and /api/ai/*."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from psycopg import Connection

from ..deps import get_db
from website_profiling.db import issue_status_store

router = APIRouter(tags=["issues"])

DbDep = Annotated[Connection, Depends(get_db)]


# ── GET /api/issues/status ────────────────────────────────────────────────────

@router.get("/issues/status")
def list_issue_status_route(
    conn: DbDep,
    propertyId: int = Query(...),
) -> dict[str, Any]:
    if not propertyId:
        raise HTTPException(status_code=400, detail="propertyId required")
    return {"issues": issue_status_store.list_issue_status(conn, propertyId)}


# ── PUT /api/issues/status ────────────────────────────────────────────────────

@router.put("/issues/status")
def upsert_issue_status_route(
    conn: DbDep,
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    property_id = int(body.get("propertyId") or 0)
    message = str(body.get("message") or "").strip()
    status = str(body.get("status") or "")

    if not property_id or not message or not status:
        raise HTTPException(
            status_code=400,
            detail="propertyId, message, and valid status required",
        )

    report_id = body.get("reportId")
    try:
        issue = issue_status_store.upsert_issue_status(
            conn,
            property_id=property_id,
            message=message,
            status=status,
            report_id=int(report_id) if report_id is not None else None,
            url=str(body.get("url") or ""),
            priority=str(body.get("priority") or "Medium"),
            category_id=body.get("categoryId") or None,
            assignee=body.get("assignee") or None,
            note=body.get("note") or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"issue": issue}


# ── POST /api/issues/fix-suggestion ──────────────────────────────────────────

@router.post("/issues/fix-suggestion")
def issues_fix_suggestion(
    body: dict[str, Any] = Body(default={}),
) -> Any:
    message = str(body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message required")

    payload = {
        "source": "issue",
        "message": message,
        "url": body.get("url"),
        "priority": body.get("priority"),
        "category": body.get("category"),
        "recommendation": body.get("recommendation"),
        "type": body.get("type"),
        "refresh": body.get("refresh"),
    }

    try:
        from website_profiling.llm.fix_suggestions import generate_fix_suggestion  # type: ignore[import]

        return generate_fix_suggestion(payload, refresh=bool(payload.get("refresh")))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Fix suggestion failed: {exc}")


# ── POST /api/issues/action-plan ──────────────────────────────────────────────

@router.post("/issues/action-plan")
def issues_action_plan(
    body: dict[str, Any] = Body(default={}),
) -> Any:
    domain = str(body.get("domain") or "").strip()
    if not domain:
        raise HTTPException(status_code=400, detail="domain required")
    if not isinstance(body.get("issues"), list) or len(body["issues"]) == 0:
        raise HTTPException(status_code=400, detail="issues required")

    payload = {
        "domain": domain,
        "issues": body["issues"],
        "refresh": body.get("refresh"),
    }

    try:
        from website_profiling.llm.issues_action_plan import generate_issues_action_plan  # type: ignore[import]

        return generate_issues_action_plan(payload, refresh=bool(payload.get("refresh")))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Action plan failed: {exc}")


# ── POST /api/ai/fix-suggestion ──────────────────────────────────────────────

@router.post("/ai/fix-suggestion")
def ai_fix_suggestion(
    body: dict[str, Any] = Body(default={}),
) -> Any:
    message = str(body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message required")

    payload = {
        "source": body.get("source") or "issue",
        "message": message,
        "url": body.get("url"),
        "refresh": body.get("refresh"),
        "context": body.get("context"),
        "priority": body.get("priority"),
        "category": body.get("category"),
        "recommendation": body.get("recommendation"),
        "type": body.get("type"),
    }

    try:
        from website_profiling.llm.fix_suggestions import generate_fix_suggestion  # type: ignore[import]

        return generate_fix_suggestion(payload, refresh=bool(payload.get("refresh")))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Fix suggestion failed: {exc}")
