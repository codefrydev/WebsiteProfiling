"""GET /api/health — liveness + DB check."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from psycopg import Connection

from ..deps import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(conn: Annotated[Connection, Depends(get_db)]) -> dict:
    conn.execute("SELECT 1")
    return {"ok": True, "database": "up"}
