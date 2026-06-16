"""Bounded parallel execution helpers shared by the agent loops and workflows.

When a model returns several independent, read-only tool calls in one turn we run
them concurrently with a bounded worker pool instead of one at a time — the same
"parallel tool execution" pattern Claude Code uses. Mirrors the ``ThreadPoolExecutor``
usage already in ``crawl/crawler.py``, ``llm/enrich.py`` and ``analysis/image_probe.py``,
and the env-int parsing in ``db/pool.py``.
"""
from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Sequence, TypeVar

T = TypeVar("T")
R = TypeVar("R")

DEFAULT_TOOL_CONCURRENCY = 6


def tool_concurrency(default: int = DEFAULT_TOOL_CONCURRENCY) -> int:
    """Max number of tool calls to dispatch concurrently within one agent turn.

    Override with the ``WP_TOOL_CONCURRENCY`` env var; a value of ``1`` disables
    parallelism (every dispatch runs sequentially). Empty or non-integer values fall
    back to ``default``. The result is floored at 1.
    """
    raw = (os.environ.get("WP_TOOL_CONCURRENCY") or "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def map_parallel(
    items: Sequence[T],
    fn: Callable[[T], R],
    *,
    max_workers: int,
) -> list[R]:
    """Apply ``fn`` to each item, returning results in input order.

    Runs sequentially when ``max_workers <= 1`` or there is at most one item; otherwise
    uses a bounded thread pool. ``fn`` MUST NOT raise — callers wrap their work in
    try/except and return an error value so one failure never sinks the batch.
    """
    count = len(items)
    if count == 0:
        return []
    workers = max(1, min(max_workers, count))
    if workers == 1 or count == 1:
        return [fn(item) for item in items]
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return list(pool.map(fn, items))
