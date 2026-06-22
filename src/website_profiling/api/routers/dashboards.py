"""Dashboards router — /api/dashboards/*"""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from psycopg import Connection

from ..deps import get_db
from website_profiling.db import dashboard_store

router = APIRouter(tags=["dashboards"])

DbDep = Annotated[Connection, Depends(get_db)]


class DashboardCreateBody(BaseModel):
    propertyId: int
    name: Optional[str] = None
    layoutJson: Optional[Any] = None


class DashboardUpdateBody(BaseModel):
    propertyId: int
    name: Optional[str] = None
    layoutJson: Optional[Any] = None
    isDefault: Optional[bool] = None


@router.get("/dashboards")
def list_dashboards(
    conn: DbDep,
    propertyId: int = Query(..., description="Property ID"),
) -> dict[str, Any]:
    return {"dashboards": dashboard_store.list_dashboards(conn, propertyId)}


@router.post("/dashboards", status_code=201)
def create_dashboard(body: DashboardCreateBody, conn: DbDep) -> dict[str, Any]:
    name = (body.name or "Untitled dashboard").strip() or "Untitled dashboard"
    layout = body.layoutJson if body.layoutJson is not None else {}
    dashboard = dashboard_store.create_dashboard(conn, body.propertyId, name, layout)
    return {"dashboard": dashboard}


@router.get("/dashboards/{dashboard_id}")
def get_dashboard(
    dashboard_id: int,
    conn: DbDep,
    propertyId: int = Query(..., description="Property ID"),
) -> dict[str, Any]:
    dashboard = dashboard_store.get_dashboard(conn, dashboard_id, propertyId)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Not found")
    return {"dashboard": dashboard}


@router.put("/dashboards/{dashboard_id}")
def update_dashboard(dashboard_id: int, body: DashboardUpdateBody, conn: DbDep) -> dict[str, Any]:
    dashboard = dashboard_store.update_dashboard(
        conn,
        dashboard_id,
        body.propertyId,
        name=body.name.strip() if body.name is not None else None,
        layout_json=body.layoutJson,
        is_default=body.isDefault,
    )
    if not dashboard:
        raise HTTPException(status_code=404, detail="Not found")
    return {"dashboard": dashboard}


@router.delete("/dashboards/{dashboard_id}")
def delete_dashboard(
    dashboard_id: int,
    conn: DbDep,
    propertyId: int = Query(..., description="Property ID"),
) -> dict[str, Any]:
    if not dashboard_store.delete_dashboard(conn, dashboard_id, propertyId):
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


class DashboardAiGenerateBody(BaseModel):
    mode: str
    prompt: str
    catalog: list[dict[str, Any]]
    viz_types: dict[str, str]
    dashscript_help: str
    toolName: Optional[str] = None
    propertyId: Optional[int] = None
    reportId: Optional[int] = None
    current: Optional[Any] = None
    sample: Optional[dict[str, Any]] = None


def _truncate_tool_sample(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for key, val in data.items():
        out[key] = val[:2] if isinstance(val, list) else val
    return out


@router.post("/dashboards/ai-generate")
def dashboards_ai_generate(body: DashboardAiGenerateBody, conn: DbDep) -> JSONResponse:
    """Generate DashScript, a widget, or a full dashboard via LLM."""
    mode = str(body.mode or "widget").strip().lower()
    if mode not in {"script", "widget", "dashboard"}:
        raise HTTPException(status_code=400, detail="mode must be script, widget, or dashboard")
    prompt = str(body.prompt or "").strip()
    if not prompt:
        raise HTTPException(status_code=400, detail="prompt required")

    payload: dict[str, Any] = {
        "mode": mode,
        "prompt": prompt,
        "catalog": body.catalog,
        "viz_types": body.viz_types,
        "dashscript_help": body.dashscript_help,
        "current": body.current,
    }

    if body.sample is not None:
        payload["sample"] = body.sample
    elif body.toolName and body.propertyId and mode in ("script", "widget"):
        try:
            from website_profiling.tools.audit_tools import AuditToolContext
            from website_profiling.tools.audit_tools.registry import dispatch_tool

            ctx = AuditToolContext(property_id=body.propertyId, report_id=body.reportId)
            tool_result = dispatch_tool(body.toolName, {}, context=ctx, conn=conn)
            if isinstance(tool_result, dict) and "error" not in tool_result:
                payload["sample"] = _truncate_tool_sample(tool_result)
        except Exception:
            pass

    from website_profiling.db.config_store import read_llm_config
    from website_profiling.llm.dashboard_ai import generate_dashboard_ai

    cfg = read_llm_config(conn)
    result = generate_dashboard_ai(payload, cfg=cfg or None)
    if result.get("ok") is False:
        status = 503 if result.get("missing") else 500
        return JSONResponse(content=result, status_code=status)
    return JSONResponse(content=result)
