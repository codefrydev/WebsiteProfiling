"""Dashboards router — /api/dashboards/*"""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
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

