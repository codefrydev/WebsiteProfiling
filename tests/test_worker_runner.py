"""Tests for worker subprocess pause/cancel result handling."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.worker.runner import SubprocessRunResult, execute_subprocess_for_claimed_job, run_job


def test_execute_subprocess_paused_with_exit_code_2():
    """Crawler exits with code 2 on pause; worker must still report paused=True."""
    proc = MagicMock()
    proc.poll.side_effect = [None, 2]
    proc.returncode = 2
    proc.stdout = MagicMock()
    proc.stderr = MagicMock()

    flag_calls = iter([(False, True), (False, True)])

    def _check_flags(conn, job_id):
        return next(flag_calls)

    mock_conn = MagicMock()

    with (
        patch("website_profiling.worker.runner.subprocess.Popen", return_value=proc),
        patch("website_profiling.worker.runner.db_session") as db_session,
        patch("website_profiling.worker.runner.check_flags", side_effect=_check_flags),
        patch("website_profiling.worker.runner.pause_subprocess") as pause_fn,
        patch("website_profiling.worker.runner.time.sleep"),
        patch("website_profiling.worker.runner.threading.Thread") as Thread,
    ):
        thread = MagicMock()
        Thread.return_value = thread
        db_cm = MagicMock()
        db_cm.__enter__.return_value = mock_conn
        db_cm.__exit__.return_value = False
        db_session.return_value = db_cm

        result = execute_subprocess_for_claimed_job("job-1", "crawl", property_id=1)

    assert result.paused is True
    assert result.exit_code == 2
    assert result.cancelled is False
    pause_fn.assert_called_once_with(proc)


def test_run_job_finishes_as_paused_when_exit_code_2():
    finished: dict = {}

    def _finish(conn, job_id, status, exit_code, error=None, log_truncated=False):
        finished.update(
            job_id=job_id,
            status=status,
            exit_code=exit_code,
            error=error,
            log_truncated=log_truncated,
        )

    mock_conn = MagicMock()
    mock_conn.execute.return_value.fetchone.return_value = {"log_truncated": False}

    with (
        patch(
            "website_profiling.worker.runner.execute_subprocess_for_claimed_job",
            return_value=SubprocessRunResult(2, paused=True),
        ),
        patch("website_profiling.worker.runner.db_session") as db_session,
        patch("website_profiling.worker.runner.finish_job", side_effect=_finish),
    ):
        db_cm = MagicMock()
        db_cm.__enter__.return_value = mock_conn
        db_cm.__exit__.return_value = False
        db_session.return_value = db_cm
        run_job({"id": "job-paused", "command": "crawl", "property_id": 1})

    assert finished["status"] == "paused"
    assert finished["exit_code"] == 2
    assert finished["job_id"] == "job-paused"
