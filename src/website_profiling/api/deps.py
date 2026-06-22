"""Shared FastAPI dependencies."""
from __future__ import annotations

from typing import Iterator

from psycopg import Connection

from website_profiling.db.pool import db_session


def get_db() -> Iterator[Connection]:
    """Yield a synchronous psycopg connection from the pool.

    Declare route handlers as plain ``def`` (not ``async def``) so FastAPI
    runs them in a thread pool automatically — this matches the existing
    synchronous codebase and requires no pool migration.
    """
    with db_session() as conn:
        yield conn
