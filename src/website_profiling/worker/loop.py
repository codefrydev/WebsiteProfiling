"""Worker main loop: poll pending jobs and run them one at a time."""
from __future__ import annotations

import logging
import os
import signal
import time

from website_profiling.db.pipeline_jobs import try_claim_pending_job
from website_profiling.db.pool import db_session

from .runner import run_job

logger = logging.getLogger("website_profiling.worker")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

_POLL_INTERVAL = float(os.getenv("WP_WORKER_POLL_INTERVAL", "1.0"))

_running = True


def _handle_sigterm(signum: int, frame: object) -> None:
    global _running
    logger.info("Worker received signal %s, shutting down after current job.", signum)
    _running = False


def run_worker_loop() -> None:
    signal.signal(signal.SIGTERM, _handle_sigterm)
    signal.signal(signal.SIGINT, _handle_sigterm)

    logger.info("Pipeline worker started (PID %s, poll interval %.1fs).", os.getpid(), _POLL_INTERVAL)

    while _running:
        try:
            with db_session() as conn:
                job = try_claim_pending_job(conn, os.getpid())
        except Exception as exc:
            logger.warning("Worker DB poll error: %s", exc)
            time.sleep(_POLL_INTERVAL)
            continue

        if job:
            logger.info("Running job %s (command=%r).", job["id"], job.get("command"))
            try:
                run_job(job)
            except Exception as exc:
                logger.error("Unhandled error in job %s: %s", job["id"], exc, exc_info=True)
        else:
            time.sleep(_POLL_INTERVAL)

    logger.info("Worker exiting cleanly.")
