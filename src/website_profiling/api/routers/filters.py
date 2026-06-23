"""Saved filters router — /api/filters"""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from psycopg import Connection

from ..deps import get_db
from website_profiling.db import saved_filter_store

router = APIRouter(tags=["filters"])

DbDep = Annotated[Connection, Depends(get_db)]


class FilterUpsertBody(BaseModel):
    propertyId: int
    name: str
    filterJson: Optional[Any] = None


class FilterDeleteBody(BaseModel):
    propertyId: int
    name: str


@router.get("/filters")
def list_filters(
    conn: DbDep,
    propertyId: int = Query(..., description="Property ID"),
) -> dict[str, Any]:
    return {"filters": saved_filter_store.list_saved_filters(conn, propertyId)}


@router.post("/filters")
def upsert_filter(body: FilterUpsertBody, conn: DbDep) -> dict[str, Any]:
    name = (body.name or "").strip()
    if not body.propertyId or not name:
        raise HTTPException(status_code=400, detail="propertyId and name required")
    filter_json = body.filterJson if isinstance(body.filterJson, dict) else {}
    saved_filter_store.upsert_saved_filter(conn, body.propertyId, name, filter_json)
    return {"ok": True}


@router.delete("/filters")
def delete_filter(body: FilterDeleteBody, conn: DbDep) -> dict[str, Any]:
    name = (body.name or "").strip()
    if not body.propertyId or not name:
        raise HTTPException(status_code=400, detail="propertyId and name required")
    deleted = saved_filter_store.delete_saved_filter(conn, body.propertyId, name)
    if not deleted:
        raise HTTPException(status_code=404, detail="filter not found")
    return {"ok": True}
