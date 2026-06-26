"""Subprocess runner: spawn the audit CLI and pump output to the DB."""
from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from typing import Any

from website_profiling.db.pipeline_jobs import append_job_log, check_flags, finish_job
from website_profiling.db.pool import db_session

from .signals import cancel_subprocess, pause_subprocess


def _get_spawn_env(property_id: Any = None) -> dict[str, str]:
    """Build env dict for spawning `python -m src`, mirroring pipelineSpawnEnv.ts."""
    repo_root = os.environ.get("WEBSITE_PROFILING_ROOT", os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    ))
    data_dir = os.environ.get("DATA_DIR", os.path.join(repo_root, "data"))
    env = os.environ.copy()
    env["WEBSITE_PROFILING_ROOT"] = repo_root
    env["DATA_DIR"] = data_dir
    existing_pythonpath = env.get("PYTHONPATH", "")
    src_path = os.path.join(repo_root, "src")
    env["PYTHONPATH"] = f"{src_path}{os.pathsep}{existing_pythonpath}" if existing_pythonpath else src_path
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    if property_id is not None:
        env["WP_PROPERTY_ID"] = str(property_id)
    return env


def _pump_output(proc: subprocess.Popen, job_id: str) -> None:  # type: ignore[type-arg]
    """Read stdout+stderr from the subprocess and append to DB log."""
    def _pump_stream(stream: Any) -> None:
        while True:
            line = stream.readline()
            if not line:
                break
            text = line if isinstance(line, str) else line.decode("utf-8", errors="replace")
            try:
                with db_session() as conn:
                    append_job_log(conn, job_id, text)
            except Exception:
                pass

    t_out = threading.Thread(target=_pump_stream, args=(proc.stdout,), daemon=True)
    t_err = threading.Thread(target=_pump_stream, args=(proc.stderr,), daemon=True)
    t_out.start()
    t_err.start()
    t_out.join()
    t_err.join()


def run_job(job: dict) -> None:
    """Execute one pipeline job, handling cancel/pause/resume signals."""
    job_id: str = job["id"]
    command: str | None = job.get("command")
    property_id = job.get("property_id")

    repo_root = os.environ.get("WEBSITE_PROFILING_ROOT", "")
    python_exe = os.environ.get("PYTHON", sys.executable)

    args = [python_exe, "-m", "src"]
    if command:
        args.extend(command.split())

    env = _get_spawn_env(property_id)
    if (os.environ.get("PIPELINE_ORCHESTRATE_VIA_REPORT_SERVICE") or "").strip().lower() in {"1", "true", "yes"}:
        env["PIPELINE_ORCHESTRATE_VIA_REPORT_SERVICE"] = "1"

    try:
        proc = subprocess.Popen(
            args,
            cwd=repo_root or None,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=1,
            universal_newlines=True,
        )
    except Exception as exc:
        with db_session() as conn:
            finish_job(conn, job_id, "error", -1, str(exc))
        return

    pump_thread = threading.Thread(target=_pump_output, args=(proc, job_id), daemon=True)
    pump_thread.start()

    paused = False

    while proc.poll() is None:
        time.sleep(1.0)
        try:
            with db_session() as conn:
                cancel, pause = check_flags(conn, job_id)
        except Exception:
            cancel, pause = False, False

        if cancel:
            cancel_subprocess(proc)
            proc.wait()
            pump_thread.join(timeout=5)
            with db_session() as conn:
                finish_job(conn, job_id, "error", -1, "Cancelled by user")
            return

        if pause and not paused:
            pause_subprocess(proc)
            paused = True

    proc.wait()
    pump_thread.join(timeout=10)

    exit_code = proc.returncode

    if paused and exit_code == 0:
        with db_session() as conn:
            job_row = conn.execute(
                "SELECT log_text FROM pipeline_jobs WHERE id = %s::uuid", (job_id,)
            ).fetchone()
            log_truncated_row = conn.execute(
                "SELECT log_truncated FROM pipeline_jobs WHERE id = %s::uuid", (job_id,)
            ).fetchone()
            log_truncated = bool((log_truncated_row or {}).get("log_truncated"))
            finish_job(conn, job_id, "paused", exit_code, log_truncated=log_truncated)
        return

    if exit_code == 0 and _should_post_crawl_report(command) and property_id is not None:
        _finish_job_after_post_crawl_report(job_id, property_id)
        return

    status = "success" if exit_code == 0 else "error"
    error = None if exit_code == 0 else f"Process exited with code {exit_code}"
    with db_session() as conn:
        finish_job(conn, job_id, status, exit_code, error)


def _should_post_crawl_report(command: str | None) -> bool:
    flag = (os.environ.get("PIPELINE_ORCHESTRATE_VIA_REPORT_SERVICE") or "").strip().lower()
    if flag not in {"1", "true", "yes"}:
        return False
    if command and command.strip() and command.split()[0] not in {None, "", "crawl"}:
        return False
    return True


def _finish_job_after_post_crawl_report(job_id: str, property_id: Any) -> None:
    """Run post-crawl report via ReportService and finish the pipeline job with combined status."""
    try:
        with db_session() as conn:
            append_job_log(conn, job_id, "\n[Report] Post-crawl report build starting...\n")
        from website_profiling.commands.report_build import build_report_resilient, load_config_for_property

        with db_session() as conn:
            cfg = load_config_for_property(conn, int(property_id), None, None)
        out = build_report_resilient(cfg, int(property_id))
        with db_session() as conn:
            append_job_log(conn, job_id, f"\n[Report] Done. Output: {out}\n")
            finish_job(conn, job_id, "success", 0, None)
    except Exception as exc:
        print(f"[worker] Post-crawl report build failed: {exc}", file=sys.stderr)
        with db_session() as conn:
            append_job_log(conn, job_id, f"\n[Report] Failed: {exc}\n")
            finish_job(conn, job_id, "error", 1, str(exc))
