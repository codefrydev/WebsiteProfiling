"""PostgreSQL connection pool and session."""
from __future__ import annotations

import atexit
import os
from contextlib import contextmanager
from typing import Iterator

from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

_pool: ConnectionPool | None = None
_shutdown_registered = False


def _env_int(name: str, default: int) -> int:
    raw = (os.environ.get(name) or "").strip()
    if not raw:
        return default
    try:
        return max(1, int(raw))
    except ValueError:
        return default


def get_database_url() -> str:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if not url:
        raise RuntimeError(
            "DATABASE_URL is required. Example: postgres://user:pass@localhost:5432/website_profiling"
        )
    # Prefer fast failure when DB is unreachable (tests, local dev).
    # psycopg accepts libpq params in the DSN/querystring.
    if "connect_timeout=" not in url:
        url = f"{url}{'&' if '?' in url else '?'}connect_timeout=3"
    return url


def get_data_dir() -> str:
    return (os.environ.get("DATA_DIR") or os.getcwd()).strip() or os.getcwd()


def close_db_pool() -> None:
    """Close the process-wide connection pool (idempotent, safe to call multiple times)."""
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None


def _register_pool_shutdown() -> None:
    global _shutdown_registered
    if not _shutdown_registered:
        atexit.register(close_db_pool)
        _shutdown_registered = True


def _get_pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            conninfo=get_database_url(),
            min_size=_env_int("DB_POOL_MIN", 2),
            max_size=_env_int("DB_POOL_MAX", 20),
            open=True,
            kwargs={"row_factory": dict_row},
        )
        _register_pool_shutdown()
    return _pool


@contextmanager
def db_session() -> Iterator[Connection]:
    """Yield a PostgreSQL connection from the process pool."""
    with _get_pool().connection(timeout=5) as conn:
        yield conn




def init_schema(conn: Connection | None = None) -> None:
    """No-op at runtime; schema is applied via Alembic migrations."""
