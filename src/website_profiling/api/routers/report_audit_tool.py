"""Audit tool dispatch — POST /api/report/audit-tool."""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection
from pydantic import BaseModel

from ..deps import get_db

router = APIRouter(prefix="/report", tags=["report-audit-tool"])

DbDep = Annotated[Connection, Depends(get_db)]


class AuditToolBody(BaseModel):
    toolName: str
    propertyId: int
    reportId: Optional[int] = None
    args: dict[str, Any] = {}


@router.post("/audit-tool")
def run_audit_tool(body: AuditToolBody, conn: DbDep) -> dict[str, Any]:
    if not body.toolName or not body.propertyId:
        raise HTTPException(status_code=400, detail="toolName and propertyId required")

    try:
        from website_profiling.tools.audit_tools import AuditToolContext
        from website_profiling.tools.audit_tools.registry import dispatch_tool

        context = AuditToolContext(
            property_id=body.propertyId,
            report_id=body.reportId,
        )
        result = dispatch_tool(body.toolName, body.args, context=context, conn=conn)
        return {"result": result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
