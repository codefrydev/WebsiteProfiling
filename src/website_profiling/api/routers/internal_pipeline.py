"""Internal bridge: ReportService C# worker runs Python CLI subprocesses in this container."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

from website_profiling.worker.runner import execute_subprocess_for_claimed_job

router = APIRouter(prefix="/internal/pipeline", tags=["internal-pipeline"])


@router.post("/execute-subprocess")
def internal_execute_subprocess(body: dict[str, Any]) -> dict[str, Any]:
    job_id = str(body.get("jobId") or "").strip()
    if not job_id:
        raise HTTPException(status_code=400, detail="jobId is required")

    command = body.get("command")
    command_str = str(command).strip() if command is not None else None
    if command_str == "":
        command_str = None

    property_id = body.get("propertyId")
    pid: int | None
    try:
        pid = int(property_id) if property_id is not None else None
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="propertyId must be a valid integer")

    result = execute_subprocess_for_claimed_job(job_id, command_str, pid)
    return {
        "exitCode": result.exit_code,
        "cancelled": result.cancelled,
        "paused": result.paused,
    }
