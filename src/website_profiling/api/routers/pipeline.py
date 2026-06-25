"""Pipeline job routers — /api/run, /api/jobs."""
from __future__ import annotations

import re
import uuid
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from ..deps import get_db
from ..schemas.pipeline import (
    ALLOWED_COMMANDS,
    CancelResponse,
    JobResponse,
    JobsListResponse,
    PauseResponse,
    ResumeResponse,
    RunPostBody,
    RunResponse,
    coerce_pipeline_state,
    validate_pipeline_run,
)

router = APIRouter(tags=["pipeline"])

DbDep = Annotated[Connection, Depends(get_db)]

_PAUSE_RUN_ID_RE = re.compile(r"CRAWL_RUN_ID=(\d+)")


def _get_pipeline_jobs_db(conn: Connection):
    """Late import to avoid circular deps at startup."""
    from website_profiling.db.pipeline_jobs import (
        cancel_job_in_db,
        check_flags,
        enqueue_job,
        get_active_job,
        get_job,
        list_jobs,
        reconcile_stale_jobs,
        set_cancel_flag,
        set_pause_flag,
    )
    return locals()


# ── POST /api/run ─────────────────────────────────────────────────────────────

@router.post("/run", response_model=RunResponse)
def run_pipeline(body: RunPostBody, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.config_store import (
        read_pipeline_config,
        write_pipeline_config,
    )
    from website_profiling.db.pipeline_jobs import enqueue_job, reconcile_stale_jobs
    from website_profiling.db.property_store import upsert_property_by_domain

    command = body.command or None
    command_base = command.split()[0] if command else None
    if command_base is not None and command_base not in {
        c for c in ALLOWED_COMMANDS if c is not None and c
    }:
        raise HTTPException(status_code=400, detail=f"Invalid command: {command_base}")

    # Resolve state — fall back to saved config if not provided
    raw_state = body.state
    unknown_keys = [{"key": u.key, "value": u.value} for u in (body.unknownKeys or [])]

    if not raw_state:
        try:
            saved_state, saved_unknown = read_pipeline_config(conn)
            raw_state = saved_state
            unknown_keys = saved_unknown
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Missing state and could not load config: {exc}",
            )

    if not raw_state:
        raise HTTPException(status_code=400, detail="Missing state object")

    state = coerce_pipeline_state(raw_state)

    # Filter unknown keys
    safe_unknown = [
        u for u in unknown_keys
        if isinstance(u, dict)
        and not str(u.get("key", "")).startswith("llm_")
        and not str(u.get("key", "")).startswith("ml_")
    ]

    # Resolve property ID from start_url
    start_url = str(state.get("start_url") or "").strip()
    property_id: int | None = body.propertyId
    if start_url:
        from urllib.parse import urlparse
        hostname = urlparse(start_url).hostname or ""
        if hostname:
            try:
                from website_profiling.db.property_store import (
                    canonical_domain_from_start_url,
                    upsert_property_by_domain,
                )
                domain = canonical_domain_from_start_url(start_url)
                if domain:
                    property_id = upsert_property_by_domain(
                        conn, domain, domain, start_url
                    )
            except Exception:
                pass
        state["active_property_id"] = str(property_id or "")

    # Validate
    errors = validate_pipeline_run(state, command)
    if errors:
        raise HTTPException(status_code=400, detail=" ".join(errors))

    # Save pipeline config
    str_state = {k: str(v) for k, v in state.items() if v is not None}
    try:
        write_pipeline_config(conn, str_state, safe_unknown)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to save config: {exc}")

    # Enqueue job
    job_id = str(uuid.uuid4())
    try:
        ok = enqueue_job(conn, job_id, command_base or "full", command, property_id, None)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    if not ok:
        raise HTTPException(status_code=400, detail="An audit job is already running")

    return {"jobId": job_id}


# ── GET /api/jobs ─────────────────────────────────────────────────────────────

@router.get("/jobs", response_model=JobsListResponse)
def list_pipeline_jobs(
    conn: DbDep,
    limit: int = Query(20, ge=1, le=100),
) -> dict[str, Any]:
    from website_profiling.db.pipeline_jobs import (
        get_active_job,
        list_jobs,
        reconcile_stale_jobs,
    )

    reconciled = reconcile_stale_jobs(conn)
    active = get_active_job(conn)
    jobs = list_jobs(conn, limit)
    return {"jobs": jobs, "active": active, "reconciled": reconciled}


# ── GET /api/jobs/{id} ────────────────────────────────────────────────────────

@router.get("/jobs/{job_id}")
def get_pipeline_job(job_id: str, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.pipeline_jobs import get_job

    job = get_job(conn, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {
        "status": job["status"],
        "exitCode": job["exitCode"],
        "log": job["log"],
        "error": job.get("error"),
        "logTruncated": job.get("logTruncated", False),
    }


# ── POST /api/jobs/{id}/cancel ────────────────────────────────────────────────

@router.post("/jobs/{job_id}/cancel", response_model=CancelResponse)
def cancel_pipeline_job(job_id: str, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.pipeline_jobs import cancel_job_in_db, get_job, set_cancel_flag

    job = get_job(conn, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] not in ("pending", "running"):
        raise HTTPException(status_code=409, detail="Job is not running")

    # Set the cancel flag — the worker will pick it up and kill the subprocess.
    set_cancel_flag(conn, job_id)
    return {"ok": True, "status": job["status"]}


# ── POST /api/jobs/{id}/pause ─────────────────────────────────────────────────

@router.post("/jobs/{job_id}/pause", response_model=PauseResponse)
def pause_pipeline_job(job_id: str, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.pipeline_jobs import get_job, set_pause_flag

    job = get_job(conn, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "running":
        raise HTTPException(status_code=409, detail="Job is not running")

    set_pause_flag(conn, job_id)
    return {"ok": True}


# ── POST /api/jobs/{id}/resume ────────────────────────────────────────────────

@router.post("/jobs/{job_id}/resume", response_model=ResumeResponse)
def resume_pipeline_job(job_id: str, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.pipeline_jobs import enqueue_job, get_job

    job = get_job(conn, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if job["status"] != "paused":
        raise HTTPException(status_code=409, detail="Job is not paused")

    # Extract paused crawl run ID from log
    log_text = str(job.get("log") or "")
    m = _PAUSE_RUN_ID_RE.search(log_text)
    if not m:
        raise HTTPException(status_code=409, detail="No paused crawl run found for this job")

    paused_run_id = int(m.group(1))
    resume_command = f"--resume-run-id {paused_run_id}"
    new_job_id = str(uuid.uuid4())

    ok = enqueue_job(
        conn,
        new_job_id,
        "crawl-resume",
        resume_command,
        job.get("propertyId"),
        None,
    )
    if not ok:
        raise HTTPException(status_code=400, detail="An audit job is already running")

    return {"ok": True, "newJobId": new_job_id}
