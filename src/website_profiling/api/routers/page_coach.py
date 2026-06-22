"""Internal link page coach — /api/links/page-coach."""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection
from pydantic import BaseModel

from ..deps import get_db

router = APIRouter(tags=["page-coach"])

DbDep = Annotated[Connection, Depends(get_db)]


class PageCoachBody(BaseModel):
    url: Optional[str] = None
    refresh: bool = False
    currentType: Optional[str] = None
    currentId: Optional[int] = None
    baselineType: Optional[str] = None
    baselineId: Optional[int] = None
    propertyId: Optional[int] = None


@router.post("/links/page-coach")
def page_coach(body: PageCoachBody, conn: DbDep) -> dict[str, Any]:
    url = (body.url or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url required")
    try:
        from website_profiling.tools.page_coach import run_page_coach

        return run_page_coach(
            conn,
            url=url,
            refresh=body.refresh,
            current_type=body.currentType,
            current_id=body.currentId,
            baseline_type=body.baselineType,
            baseline_id=body.baselineId,
            property_id=body.propertyId,
        )
    except ImportError:
        raise HTTPException(status_code=501, detail="Page coach module unavailable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
