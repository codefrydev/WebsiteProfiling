"""Report comparison export — /api/compare/*."""
from __future__ import annotations

from typing import Annotated, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from psycopg import Connection
from pydantic import BaseModel

from ..deps import get_db

router = APIRouter(tags=["compare"])

DbDep = Annotated[Connection, Depends(get_db)]


class CompareExportBody(BaseModel):
    reportIdA: Optional[int] = None
    reportIdB: Optional[int] = None


def _csv_escape(val: str) -> str:
    if any(c in val for c in ('",\n')):
        return f'"{val.replace(chr(34), chr(34) + chr(34))}"'
    return val


@router.post("/compare/export")
def compare_export(body: CompareExportBody, conn: DbDep) -> Response:
    if not body.reportIdA or not body.reportIdB:
        raise HTTPException(status_code=400, detail="reportIdA and reportIdB required")

    from website_profiling.db.report_store import read_report_payload

    payload_a = read_report_payload(conn, body.reportIdA)
    payload_b = read_report_payload(conn, body.reportIdB)
    if not payload_a or not payload_b:
        raise HTTPException(status_code=404, detail="One or both reports not found")

    lines = ["Category,Issue Title,Priority,Change\n"]
    cats_a = {c.get("id") or c.get("name"): c for c in (payload_a.get("categories") or [])}
    cats_b = {c.get("id") or c.get("name"): c for c in (payload_b.get("categories") or [])}
    for key in set(list(cats_a.keys()) + list(cats_b.keys())):
        cat_a = cats_a.get(key) or {}
        cat_b = cats_b.get(key) or {}
        issues_a = {i.get("title"): i for i in (cat_a.get("issues") or [])}
        issues_b = {i.get("title"): i for i in (cat_b.get("issues") or [])}
        for title in set(list(issues_a.keys()) + list(issues_b.keys())):
            in_a = title in issues_a
            in_b = title in issues_b
            change = "removed" if in_a and not in_b else "added" if not in_a and in_b else "unchanged"
            priority = (issues_b.get(title) or issues_a.get(title) or {}).get("priority", "")
            lines.append(f"{_csv_escape(str(key))},{_csv_escape(str(title))},{priority},{change}\n")

    csv_content = "".join(lines)
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=compare_export.csv"},
    )
