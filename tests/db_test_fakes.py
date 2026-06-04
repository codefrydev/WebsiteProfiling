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

    def set_next_cursor(self, cur: FakeCursor) -> None:
        self._next_cursor = cur

    def execute(self, sql: str, params: tuple[Any, ...] | None = None) -> FakeCursor:
        self.executed.append((sql, params))
        if self._next_cursor is None:
            return FakeCursor()
        cur = self._next_cursor
        self._next_cursor = None
        return cur

    @contextmanager
    def cursor(self) -> Iterator[FakeCursor]:
        cur = FakeCursor()
        yield cur

    def commit(self) -> None:
        self.commits += 1

    @contextmanager
    def transaction(self) -> Iterator[None]:
        yield None

