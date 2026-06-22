"""Access log upload and analysis — /api/logs/*."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from psycopg import Connection

from ..deps import get_db

router = APIRouter(tags=["logs"])

DbDep = Annotated[Connection, Depends(get_db)]


@router.post("/logs/upload")
def logs_upload(
    conn: DbDep,
    propertyId: int = Form(...),
    file: UploadFile = File(...),
) -> dict[str, Any]:
    if not propertyId:
        raise HTTPException(status_code=400, detail="propertyId required")
    content = file.file.read().decode("utf-8", errors="replace")
    try:
        from website_profiling.tools.log_analysis import parse_and_store_access_log

        result = parse_and_store_access_log(conn, propertyId, content)
        return result if isinstance(result, dict) else {"ok": True}
    except ImportError:
        raise HTTPException(status_code=501, detail="Log analysis module unavailable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
