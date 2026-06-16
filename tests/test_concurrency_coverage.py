"""Coverage for the bounded parallel execution helpers."""
from __future__ import annotations

from website_profiling.concurrency import (
    DEFAULT_TOOL_CONCURRENCY,
    map_parallel,
    tool_concurrency,
)


def test_tool_concurrency_default_when_unset(monkeypatch) -> None:
    monkeypatch.delenv("WP_TOOL_CONCURRENCY", raising=False)
    assert tool_concurrency() == DEFAULT_TOOL_CONCURRENCY
    assert tool_concurrency(3) == 3


def test_tool_concurrency_reads_env(monkeypatch) -> None:
    monkeypatch.setenv("WP_TOOL_CONCURRENCY", "4")
    assert tool_concurrency() == 4


def test_tool_concurrency_floor_and_bad_value(monkeypatch) -> None:
    monkeypatch.setenv("WP_TOOL_CONCURRENCY", "0")
    assert tool_concurrency() == 1
    monkeypatch.setenv("WP_TOOL_CONCURRENCY", "-5")
    assert tool_concurrency() == 1
    monkeypatch.setenv("WP_TOOL_CONCURRENCY", "not-an-int")
    assert tool_concurrency(7) == 7


def test_map_parallel_empty() -> None:
    assert map_parallel([], lambda x: x, max_workers=4) == []


def test_map_parallel_single_and_sequential() -> None:
    # single item → sequential branch
    assert map_parallel([5], lambda x: x * 2, max_workers=4) == [10]
    # max_workers == 1 → sequential branch even with many items
    assert map_parallel([1, 2, 3], lambda x: x + 1, max_workers=1) == [2, 3, 4]


def test_map_parallel_preserves_order_when_parallel() -> None:
    items = list(range(10))
    result = map_parallel(items, lambda x: x * x, max_workers=4)
    assert result == [x * x for x in items]
