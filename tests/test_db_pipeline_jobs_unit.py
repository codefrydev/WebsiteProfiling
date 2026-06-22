"""Unit tests for website_profiling.db.pipeline_jobs using FakeConn."""
from __future__ import annotations

import pytest
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))
from db_test_fakes import FakeConn, FakeCursor

from website_profiling.db.pipeline_jobs import (
    PIPELINE_LOG_MAX,
    PIPELINE_LOG_TRIM,
    _trim_log,
    append_job_log,
    cancel_job_in_db,
    check_flags,
    enqueue_job,
    finish_job,
    get_active_job,
    get_job,
    list_jobs,
    reconcile_stale_jobs,
    set_cancel_flag,
    set_pause_flag,
    try_claim_pending_job,
)


# ── _trim_log ─────────────────────────────────────────────────────────────────

def test_trim_log_no_truncation():
    result, truncated = _trim_log("hello", " world")
    assert result == "hello world"
    assert truncated is False


def test_trim_log_truncation():
    big = "x" * PIPELINE_LOG_MAX
    result, truncated = _trim_log(big, "extra")
    assert truncated is True
    assert len(result) == PIPELINE_LOG_TRIM


# ── enqueue_job ───────────────────────────────────────────────────────────────

def test_enqueue_job_success(monkeypatch):
    conn = FakeConn()
    # reconcile_stale_jobs will be called; make it a no-op
    monkeypatch.setattr(
        "website_profiling.db.pipeline_jobs.reconcile_stale_jobs", lambda c: 0
    )
    # enqueue returns a row (success)
    conn.set_next_cursor(FakeCursor(fetchone_value={"id": "abc-123"}))
    result = enqueue_job(conn, "abc-123", "crawl", None, None)
    assert result is True
    assert conn.commits == 1


def test_enqueue_job_already_running(monkeypatch):
    conn = FakeConn()
    monkeypatch.setattr(
        "website_profiling.db.pipeline_jobs.reconcile_stale_jobs", lambda c: 0
    )
    # enqueue returns no row (already running)
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    result = enqueue_job(conn, "abc-123", "crawl", None, None)
    assert result is False


# ── try_claim_pending_job ─────────────────────────────────────────────────────

def test_try_claim_pending_job_returns_job():
    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchone_value={
                "id": "job-1",
                "job_type": "crawl",
                "command": None,
                "property_id": None,
            }
        )
    )
    result = try_claim_pending_job(conn, worker_pid=1234)
    assert result is not None
    assert result["id"] == "job-1"
    assert result["job_type"] == "crawl"
    assert conn.commits == 1


def test_try_claim_pending_job_returns_none():
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    result = try_claim_pending_job(conn, worker_pid=1234)
    assert result is None


# ── append_job_log ────────────────────────────────────────────────────────────

def test_append_job_log_no_row():
    conn = FakeConn()
    # BEGIN → FakeCursor, SELECT FOR UPDATE → returns None row
    conn.set_next_cursor(FakeCursor())
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    result = append_job_log(conn, "job-1", "some output")
    assert result is False


def test_append_job_log_appends_successfully():
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor())  # BEGIN
    conn.set_next_cursor(
        FakeCursor(fetchone_value={"log_text": "existing", "log_truncated": False})
    )
    conn.set_next_cursor(FakeCursor())  # UPDATE
    conn.set_next_cursor(FakeCursor())  # COMMIT
    result = append_job_log(conn, "job-1", " more")
    assert result is False  # not truncated


def test_append_job_log_error_calls_rollback():
    class BoomConn(FakeConn):
        def execute(self, sql: str, params=None):  # type: ignore[override]
            self.executed.append((sql, params))
            if "FOR UPDATE" in sql:
                raise RuntimeError("db error")
            return FakeCursor()

    conn = BoomConn()
    with pytest.raises(RuntimeError):
        append_job_log(conn, "job-1", "chunk")
    sqls = [s for s, _ in conn.executed]
    assert any("ROLLBACK" in s for s in sqls)


def test_append_job_log_error_rollback_also_fails():
    """Covers the 'except Exception: pass' inside the rollback handler."""

    class BoomAllConn(FakeConn):
        def execute(self, sql: str, params=None):  # type: ignore[override]
            self.executed.append((sql, params))
            if "FOR UPDATE" in sql or "ROLLBACK" in sql:
                raise RuntimeError("db error")
            return FakeCursor()

    conn = BoomAllConn()
    with pytest.raises(RuntimeError):
        append_job_log(conn, "job-1", "chunk")


# ── finish_job ────────────────────────────────────────────────────────────────

def test_finish_job_without_log_truncated():
    conn = FakeConn()
    finish_job(conn, "job-1", "completed", 0)
    assert conn.commits == 1
    sql = conn.executed[0][0]
    assert "log_truncated" not in sql


def test_finish_job_with_log_truncated():
    conn = FakeConn()
    finish_job(conn, "job-1", "error", 1, error="oops", log_truncated=True)
    assert conn.commits == 1
    sql = conn.executed[0][0]
    assert "log_truncated" in sql


# ── check_flags ───────────────────────────────────────────────────────────────

def test_check_flags_returns_false_when_no_row():
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    cancel, pause = check_flags(conn, "job-1")
    assert cancel is False
    assert pause is False


def test_check_flags_returns_values():
    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(fetchone_value={"cancel_requested": True, "pause_requested": False})
    )
    cancel, pause = check_flags(conn, "job-1")
    assert cancel is True
    assert pause is False


# ── set_cancel_flag / set_pause_flag ─────────────────────────────────────────

def test_set_cancel_flag():
    conn = FakeConn()
    set_cancel_flag(conn, "job-1")
    assert conn.commits == 1
    assert any("cancel_requested" in sql for sql, _ in conn.executed)


def test_set_pause_flag():
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"id": "job-1"}))
    set_pause_flag(conn, "job-1")
    assert conn.commits == 1
    assert any("pause_requested" in sql for sql, _ in conn.executed)


# ── reconcile_stale_jobs ──────────────────────────────────────────────────────

def test_reconcile_stale_jobs():
    conn = FakeConn()
    count = reconcile_stale_jobs(conn)
    assert isinstance(count, int)


def test_reconcile_stale_jobs_commits_when_updated():
    conn = FakeConn()
    # First SELECT returns stale pending jobs
    conn.set_next_cursor(FakeCursor(fetchall_value=[{"id": "j1"}]))
    # Second SELECT returns stale running jobs
    conn.set_next_cursor(FakeCursor(fetchall_value=[{"id": "j2"}]))
    count = reconcile_stale_jobs(conn)
    assert count == 2
    assert conn.commits >= 1


# ── get_job ───────────────────────────────────────────────────────────────────

def test_get_job_returns_none_when_not_found():
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    result = get_job(conn, "no-such-job")
    assert result is None


def test_get_job_returns_dict():
    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchone_value={
                "id": "job-1",
                "job_type": "crawl",
                "status": "completed",
                "command": None,
                "property_id": None,
                "config_hash": None,
                "started_at": None,
                "finished_at": None,
                "exit_code": 0,
                "error_text": None,
                "log_text": "",
                "log_truncated": False,
                "cancel_requested": False,
                "pause_requested": False,
                "worker_pid": None,
            }
        )
    )
    result = get_job(conn, "job-1")
    assert result is not None
    assert result["id"] == "job-1"


# ── list_jobs ─────────────────────────────────────────────────────────────────

def test_list_jobs_returns_empty():
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchall_value=[]))
    result = list_jobs(conn, limit=5)
    assert result == []


# ── get_active_job ────────────────────────────────────────────────────────────

def test_get_active_job_returns_none_when_no_active():
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    result = get_active_job(conn)
    assert result is None


# ── cancel_job_in_db ──────────────────────────────────────────────────────────

def test_cancel_job_in_db_not_found():
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    result = cancel_job_in_db(conn, "no-such-job")
    assert result is False


def test_cancel_job_in_db_already_finished():
    conn = FakeConn()
    # The UPDATE returns no row because the job is already finished (status not in pending/running)
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    result = cancel_job_in_db(conn, "job-1")
    assert result is False


def test_cancel_job_in_db_running():
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"status": "running", "worker_pid": 99}))
    result = cancel_job_in_db(conn, "job-1")
    assert result is True
