"""
Minimal psycopg-like fakes for unit tests.

FakeConn routes behavior by SQL substring — it does NOT validate real schema or
query correctness. For SQL round-trips use Postgres integration tests such as
tests/test_storage_bulk.py and tests/test_gsc_links_store.py (DATABASE_URL required).
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator


class FakeCursor:
    def __init__(self, *, fetchone_value: Any = None, fetchall_value: list[Any] | None = None) -> None:
        self._fetchone_value = fetchone_value
        self._fetchall_value = fetchall_value or []
        self.executed: list[tuple[str, tuple[Any, ...] | None]] = []
        self.executemany_calls: list[tuple[str, list[Any]]] = []

    def fetchone(self) -> Any:
        return self._fetchone_value

    def fetchall(self) -> list[Any]:
        return list(self._fetchall_value)

    def executemany(self, sql: str, params: list[Any]) -> None:
        self.executemany_calls.append((sql, list(params)))


class FakeConn:
    """
    Minimal psycopg-like connection for unit tests.
    Supports execute(), cursor(), commit(), and transaction() context manager.
    """

    def __init__(self) -> None:
        self.executed: list[tuple[str, tuple[Any, ...] | None]] = []
        self.commits = 0
        self._next_cursor: FakeCursor | None = None
        self._cursor_queue: list[FakeCursor] = []

    def set_next_cursor(self, cur: FakeCursor) -> None:
        """Queue cursors returned from successive execute() calls."""
        self._cursor_queue.append(cur)

    def execute(self, sql: str, params: tuple[Any, ...] | None = None) -> FakeCursor:
        self.executed.append((sql, params))
        if self._cursor_queue:
            return self._cursor_queue.pop(0)
        if self._next_cursor is not None:
            cur = self._next_cursor
            self._next_cursor = None
            return cur
        return FakeCursor()

    @contextmanager
    def cursor(self) -> Iterator[FakeCursor]:
        cur = FakeCursor()
        yield cur

    def commit(self) -> None:
        self.commits += 1

    @contextmanager
    def transaction(self) -> Iterator[None]:
        yield None


class CrawlConn(FakeConn):
    """FakeConn with fetchone/fetchall routing for crawl_store SQL patterns."""

    def __init__(self, *, fetchone=None, fetchall=None, boom_execute: bool = False) -> None:
        super().__init__()
        self._fetchone = fetchone
        self._fetchall = fetchall or []
        self.boom_execute = boom_execute
        self._cursor = FakeCursor(fetchone_value=fetchone, fetchall_value=fetchall)

    def execute(self, sql: str, params: tuple[Any, ...] | None = None) -> FakeCursor:
        self.executed.append((sql, params))
        if self.boom_execute:
            raise RuntimeError("boom")
        if "RETURNING id" in sql:
            self._cursor = FakeCursor(fetchone_value=self._fetchone or {"id": 1})
        elif "SELECT id FROM crawl_runs" in sql:
            self._cursor = FakeCursor(fetchone_value=self._fetchone)
        elif "FROM crawl_results" in sql or "FROM edges" in sql or "FROM nodes" in sql:
            self._cursor = FakeCursor(fetchall_value=self._fetchall)
        elif "FROM crawl_runs WHERE" in sql:
            self._cursor = FakeCursor(fetchone_value=self._fetchone)
        return self._cursor

