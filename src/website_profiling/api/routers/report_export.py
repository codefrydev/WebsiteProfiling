"""Report export downloads — /api/report/export*."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from psycopg import Connection

from ..deps import get_db

router = APIRouter(prefix="/report", tags=["report-export"])

DbDep = Annotated[Connection, Depends(get_db)]

EXPORT_FORMATS = {"csv", "json"}


@router.get("/export")
def export_report(
    conn: DbDep,
    format: str = Query("csv"),
    reportId: Optional[int] = Query(None),
) -> Response:
    if format not in EXPORT_FORMATS:
        raise HTTPException(status_code=400, detail=f"Invalid format. Use one of {sorted(EXPORT_FORMATS)}")

    try:
        if format == "csv":
            from website_profiling.tools.export_audit import export_audit_csv as _export
            content = _export(reportId)
            return Response(
                content=content if isinstance(content, bytes) else content.encode(),
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=report.csv"},
            )
        if format == "json":
            import json
            from website_profiling.tools.export_audit import export_audit_json as _export
            content = _export(reportId)
            body = json.dumps(content) if not isinstance(content, (str, bytes)) else content
            return Response(
                content=body if isinstance(body, bytes) else body.encode(),
                media_type="application/json",
                headers={"Content-Disposition": "attachment; filename=report.json"},
            )
    except ImportError as exc:
        raise HTTPException(status_code=501, detail=f"Export module unavailable: {exc}")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    raise HTTPException(status_code=500, detail="Export failed")


@router.get("/export-sitemap")
def export_sitemap(
    conn: DbDep,
    reportId: Optional[int] = Query(None),
) -> Response:
    try:
        from website_profiling.tools.export_sitemap import export_sitemap as _export
        content = _export(reportId)
        return Response(
            content=content if isinstance(content, bytes) else content.encode(),
            media_type="application/xml",
            headers={"Content-Disposition": "attachment; filename=sitemap.xml"},
        )
    except ImportError:
        raise HTTPException(status_code=501, detail="Sitemap export unavailable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

