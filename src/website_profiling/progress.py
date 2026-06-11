"""Structured pipeline progress events for the web UI (@progress JSON lines)."""
from __future__ import annotations

import json
import time
from typing import Any

PREFIX = "@progress "


def emit_progress(
    phase: str,
    step: str,
    *,
    current: int | None = None,
    total: int | None = None,
    limit: int | None = None,
    url: str | None = None,
    message: str | None = None,
    elapsed_ms: int | None = None,
    avg_ms: float | None = None,
) -> None:
    """Emit a machine-readable progress line to stdout."""
    payload: dict[str, Any] = {
        "phase": phase,
        "step": step,
        "ts": int(time.time() * 1000),
    }
    if current is not None:
        payload["current"] = current
    if total is not None:
        payload["total"] = total
    if limit is not None:
        payload["limit"] = limit
    if url:
        payload["url"] = url
    if message:
        payload["message"] = message
    if elapsed_ms is not None:
        payload["elapsed_ms"] = elapsed_ms
    if avg_ms is not None:
        payload["avg_ms"] = round(avg_ms, 1)
    print(f"{PREFIX}{json.dumps(payload, ensure_ascii=False)}", flush=True)


def emit_phase_start(phase: str, message: str | None = None) -> None:
    emit_progress(phase, "start", message=message or f"{phase} starting")


def emit_phase_done(phase: str, message: str | None = None) -> None:
    emit_progress(phase, "done", message=message or f"{phase} complete")


class CrawlProgressTracker:
    """Throttle crawl progress emissions (every 2s or every 5 pages)."""

    def __init__(
        self,
        total: int | None,
        start_time: float | None = None,
        *,
        limit: int | None = None,
    ) -> None:
        self.limit = limit if limit and limit != float("inf") else None
        if self.limit is None and total and total != float("inf"):
            self.limit = int(total)
        self.total = total if total and total != float("inf") else None
        self.start_time = start_time or time.time()
        self._last_emit = 0.0
        self._last_count = 0
        self._last_url: str | None = None
        self._finished = False

    def maybe_emit(self, current: int, url: str | None = None, *, force: bool = False) -> None:
        if url:
            self._last_url = url
        now = time.time()
        delta_pages = current - self._last_count
        hit_limit = self.limit is not None and current >= self.limit
        is_complete = self._finished or hit_limit
        if not force and not is_complete:
            if current > 0 and delta_pages < 5 and (now - self._last_emit) < 2.0:
                return
        elapsed_ms = int((now - self.start_time) * 1000)
        avg_ms = elapsed_ms / current if current > 0 else None
        emit_progress(
            "crawl",
            "fetch",
            current=current,
            total=self.total,
            limit=self.limit,
            url=self._last_url,
            elapsed_ms=elapsed_ms,
            avg_ms=avg_ms,
        )
        self._last_emit = now
        self._last_count = current

    def finish(self, current: int) -> None:
        """Emit final progress with total aligned to actual pages crawled."""
        if current <= 0:
            return
        self._finished = True
        if self.limit is not None and current >= self.limit:
            self.total = self.limit
        else:
            self.total = current
        self.maybe_emit(current, force=True)
