"""Property alert checks — /api/alerts/*."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from ..deps import get_db

router = APIRouter(tags=["alerts"])

DbDep = Annotated[Connection, Depends(get_db)]


@router.post("/alerts/check")
def alerts_check(
    conn: DbDep,
    propertyId: int = Query(...),
) -> dict[str, Any]:
    if not propertyId:
        raise HTTPException(status_code=400, detail="propertyId required")
    try:
        from website_profiling.tools.alerts_runner import run_alerts_for_property

        return run_alerts_for_property(conn, propertyId)
    except ImportError:
        pass
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"ok": True, "checked": 0}
