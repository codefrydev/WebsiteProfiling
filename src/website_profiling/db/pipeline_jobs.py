"""Pipeline job DB helpers — shared by FastAPI routers and the worker process."""
from __future__ import annotations

import os
from typing import Any, Optional

from psycopg import Connection
from psycopg.errors import UniqueViolation

from .pool import db_session

# Stale job thresholds (minutes for pending, hours for running)
_STALE_PENDING_MINUTES = int(os.getenv("PIPELINE_JOB_STALE_PENDING_MINUTES", "10"))
_STALE_RUNNING_HOURS = int(os.getenv("PIPELINE_JOB_STALE_HOURS", "1"))

PIPELINE_LOG_MAX = 256_000
PIPELINE_LOG_TRIM = 200_000


def _trim_log(existing: str, chunk: str) -> tuple[str, bool]:
    combined = existing + chunk
    if len(combined) <= PIPELINE_LOG_MAX:
        return combined, False
    return combined[-PIPELINE_LOG_TRIM:], True


# ── Enqueue ──────────────────────────────────────────────────────────────────

def enqueue_job(
    conn: Connection,
    job_id: str,
    job_type: str,
    command: Optional[str],
    property_id: Optional[int],
    config_hash: Optional[str] = None,
) -> bool:
    """INSERT a pending job. Returns True if inserted, False if a job is already pending/running."""
    reconcile_stale_jobs(conn)
    try:
        cur = conn.execute(
            """INSERT INTO pipeline_jobs (id, job_type, status, command, property_id, config_hash)
               SELECT %s::uuid, %s, 'pending', %s, %s, %s
               WHERE NOT EXISTS (
                   SELECT 1 FROM pipeline_jobs WHERE status IN ('pending', 'running')
               )
               RETURNING id""",
            (job_id, job_type, command, property_id, config_hash),
        )
    except UniqueViolation:
        # Lost the race: another INSERT committed between our WHERE NOT EXISTS check and
        # ours; idx_pipeline_jobs_single_active caught it. Same external signal as the
        # WHERE NOT EXISTS no-row case — no job was enqueued.
        conn.rollback()
        return False
    conn.commit()
    return cur.fetchone() is not None


# ── Worker claim ─────────────────────────────────────────────────────────────

def try_claim_pending_job(conn: Connection, worker_pid: int) -> Optional[dict[str, Any]]:
    """Atomically claim one pending job for the worker. Returns the job row or None."""
    cur = conn.execute(
        """UPDATE pipeline_jobs
           SET status = 'running', worker_pid = %s
           WHERE id = (
               SELECT id FROM pipeline_jobs
               WHERE status = 'pending'
               ORDER BY started_at ASC
               LIMIT 1
               FOR UPDATE SKIP LOCKED
           )
           RETURNING id, job_type, command, property_id""",
        (worker_pid,),
    )
    row = cur.fetchone()
    conn.commit()
    if row is None:
        return None
    return {
        "id": str(row["id"]),
        "job_type": str(row["job_type"]),
        "command": row["command"],
        "property_id": row["property_id"],
    }


# ── Log appending ────────────────────────────────────────────────────────────

def append_job_log(conn: Connection, job_id: str, chunk: str) -> bool:
    """Append to log_text with row-level lock. Returns True if log was truncated."""
    cur = conn.execute(
        "SELECT log_text, log_truncated FROM pipeline_jobs WHERE id = %s::uuid FOR UPDATE",
        (job_id,),
    )
    row = cur.fetchone()
    if not row:
        conn.rollback()
        return False
    log, truncated = _trim_log(str(row["log_text"] or ""), chunk)
    log_truncated = bool(row["log_truncated"]) or truncated
    conn.execute(
        "UPDATE pipeline_jobs SET log_text = %s, log_truncated = %s WHERE id = %s::uuid",
        (log, log_truncated, job_id),
    )
    conn.commit()
    return log_truncated


# ── Finish ───────────────────────────────────────────────────────────────────

def finish_job(
    conn: Connection,
    job_id: str,
    status: str,
    exit_code: Optional[int],
    error: Optional[str] = None,
    log_truncated: Optional[bool] = None,
) -> None:
    if log_truncated is None:
        conn.execute(
            """UPDATE pipeline_jobs
               SET status = %s, exit_code = %s, error_text = %s, finished_at = now(), worker_pid = NULL
               WHERE id = %s::uuid""",
            (status, exit_code, error, job_id),
        )
    else:
        conn.execute(
            """UPDATE pipeline_jobs
               SET status = %s, exit_code = %s, error_text = %s, finished_at = now(),
                   log_truncated = %s, worker_pid = NULL
               WHERE id = %s::uuid""",
            (status, exit_code, error, log_truncated, job_id),
        )
    conn.commit()


# ── Flags ────────────────────────────────────────────────────────────────────

def check_flags(conn: Connection, job_id: str) -> tuple[bool, bool]:
    """Return (cancel_requested, pause_requested) for a running job."""
    cur = conn.execute(
        "SELECT cancel_requested, pause_requested FROM pipeline_jobs WHERE id = %s::uuid",
        (job_id,),
    )
    row = cur.fetchone()
    if not row:
        return False, False
    return bool(row["cancel_requested"]), bool(row["pause_requested"])


def set_cancel_flag(conn: Connection, job_id: str) -> bool:
    cur = conn.execute(
        """UPDATE pipeline_jobs SET cancel_requested = true
           WHERE id = %s::uuid AND status = 'running'
           RETURNING id""",
        (job_id,),
    )
    conn.commit()
    return cur.fetchone() is not None


def set_pause_flag(conn: Connection, job_id: str) -> bool:
    cur = conn.execute(
        """UPDATE pipeline_jobs SET pause_requested = true
           WHERE id = %s::uuid AND status = 'running'
           RETURNING id""",
        (job_id,),
    )
    conn.commit()
    return cur.fetchone() is not None


# ── Reconcile stale jobs ─────────────────────────────────────────────────────

def reconcile_stale_jobs(conn: Connection) -> int:
    """Mark stale running/pending jobs as error. Returns count reconciled."""
    cur = conn.execute(
        """UPDATE pipeline_jobs
           SET status = 'error',
               error_text = COALESCE(error_text, 'Job interrupted (server restart or timeout)'),
               finished_at = now()
           WHERE status = 'running'
             AND started_at < now() - (%s::text || ' hours')::interval
           RETURNING id""",
        (str(_STALE_RUNNING_HOURS),),
    )
    count = len(cur.fetchall())

    cur2 = conn.execute(
        """UPDATE pipeline_jobs
           SET status = 'error',
               error_text = 'Job never started (worker restart)',
               finished_at = now()
           WHERE status = 'pending'
             AND started_at < now() - (%s::text || ' minutes')::interval
           RETURNING id""",
        (str(_STALE_PENDING_MINUTES),),
    )
    count += len(cur2.fetchall())
    conn.commit()
    return count


# ── Read helpers ─────────────────────────────────────────────────────────────

def get_job(conn: Connection, job_id: str) -> Optional[dict[str, Any]]:
    cur = conn.execute(
        """SELECT id, job_type, status, exit_code, log_text, error_text,
                  log_truncated, property_id, started_at, finished_at, command
           FROM pipeline_jobs WHERE id = %s::uuid""",
        (job_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return _job_row_to_dict(row)


def list_jobs(conn: Connection, limit: int = 50) -> list[dict[str, Any]]:
    reconcile_stale_jobs(conn)
    cur = conn.execute(
        """SELECT id, job_type, status, exit_code, log_text, error_text,
                  log_truncated, property_id, started_at, finished_at, command
           FROM pipeline_jobs ORDER BY started_at DESC LIMIT %s""",
        (limit,),
    )
    return [_job_row_to_dict(r) for r in cur.fetchall()]


def get_active_job(conn: Connection) -> Optional[dict[str, Any]]:
    cur = conn.execute(
        """SELECT id, job_type, status, exit_code, log_text, error_text,
                  log_truncated, property_id, started_at, finished_at, command
           FROM pipeline_jobs WHERE status IN ('pending', 'running')
           ORDER BY started_at DESC LIMIT 1""",
    )
    row = cur.fetchone()
    return _job_row_to_dict(row) if row else None


def cancel_job_in_db(conn: Connection, job_id: str, message: str = "Cancelled by user") -> bool:
    cur = conn.execute(
        """UPDATE pipeline_jobs
           SET status = 'error', error_text = %s, exit_code = -1, finished_at = now()
           WHERE id = %s::uuid AND status IN ('pending', 'running')
           RETURNING id""",
        (message, job_id),
    )
    conn.commit()
    return cur.fetchone() is not None


def _job_row_to_dict(row: Any) -> dict[str, Any]:
    started_at = row["started_at"]
    finished_at = row["finished_at"]
    return {
        "id": str(row["id"]),
        "jobType": str(row["job_type"] or ""),
        "status": str(row["status"] or ""),
        "exitCode": row["exit_code"],
        "log": str(row["log_text"] or ""),
        "error": row["error_text"],
        "logTruncated": bool(row["log_truncated"]),
        "propertyId": row["property_id"],
        "startedAt": started_at.isoformat() if started_at else None,
        "finishedAt": finished_at.isoformat() if finished_at else None,
        "command": row["command"],
    }
