"""Internal-only report build bridge for ReportService (Docker / no in-process report)."""
from __future__ import annotations

import sys
import traceback
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException
from psycopg import Connection

from ..deps import get_db
from website_profiling.commands.report_build import execute_report_build, load_config_for_property

router = APIRouter(prefix="/internal/report", tags=["internal-report"])

DbDep = Annotated[Connection, Depends(get_db)]


@router.post("/build")
def internal_report_build(body: dict[str, Any] = Body(...), conn: DbDep = ...) -> dict[str, Any]:
    property_id = body.get("propertyId")
    try:
        pid = int(property_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="propertyId is required") from None
    if pid <= 0:
        raise HTTPException(status_code=400, detail="propertyId is required")

    crawl_run_id = body.get("crawlRunId")
    parsed_run_id: int | None = None
    if crawl_run_id is not None:
        try:
            parsed_run_id = int(crawl_run_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="crawlRunId must be an integer") from None

    config_override = body.get("config")
    if config_override is not None and not isinstance(config_override, dict):
        raise HTTPException(status_code=400, detail="config must be an object")

    run_keyword_enrich = body.get("runKeywordEnrich", True) is not False

    try:
        cfg = load_config_for_property(
            conn,
            pid,
            parsed_run_id,
            {str(k): str(v) for k, v in config_override.items()} if config_override else None,
        )
        out = execute_report_build(cfg, use_database=True, run_keyword_enrich=run_keyword_enrich)
        return {"ok": True, "exitCode": 0, "log": "Report build completed", "outputPath": out}
    except Exception as exc:
        tb = traceback.format_exc()
        log = f"{exc}\n{tb}"[-28000:]
        print(log, file=sys.stderr)
        return {"ok": False, "exitCode": 1, "log": log, "outputPath": None}
