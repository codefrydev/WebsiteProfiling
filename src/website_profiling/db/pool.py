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
_ro_pool: ConnectionPool | None = None
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
    """Close both connection pools (idempotent, safe to call multiple times)."""
    global _pool, _ro_pool
    if _pool is not None:
        _pool.close()
        _pool = None
    if _ro_pool is not None:
        _ro_pool.close()
        _ro_pool = None


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


# ---------------------------------------------------------------------------
# Read-only session (for the SQL chat tool)
# ---------------------------------------------------------------------------

def _get_ro_pool() -> ConnectionPool:
    """Lazy pool for read-only queries.

    Uses DATABASE_URL_READONLY when set (recommended — a least-privilege role
    with no INSERT/UPDATE/DELETE grants). Falls back to the main DATABASE_URL
    with the READ ONLY transaction flag enforced at the session level.

    autocommit=True is required so psycopg3 does NOT send an implicit BEGIN
    before the first cursor.execute().  Without it, psycopg3 sends a plain
    BEGIN (read-write) first, causing Postgres to ignore our subsequent
    'BEGIN TRANSACTION READ ONLY' with a "transaction already in progress"
    warning — leaving the connection in a read-write transaction.
    """
    global _ro_pool
    if _ro_pool is None:
        ro_url = (os.environ.get("DATABASE_URL_READONLY") or "").strip()
        url = ro_url or get_database_url()
        # Small pool: read-only queries run one at a time per chat turn
        _ro_pool = ConnectionPool(
            conninfo=url,
            min_size=1,
            max_size=_env_int("DB_RO_POOL_MAX", 5),
            open=True,
            kwargs={"row_factory": dict_row, "autocommit": True},
        )
        _register_pool_shutdown()
    return _ro_pool


@contextmanager
def readonly_session() -> Iterator[Connection]:
    """Yield a Postgres connection locked to READ ONLY with a statement timeout.

    Defense-in-depth:
    - Layer 2: Postgres refuses any write inside a READ ONLY transaction.
    - Layer 3 (optional): If DATABASE_URL_READONLY points to a least-privilege
      role the DB-level privileges also prevent writes.

    The statement timeout is taken from the SQL_STATEMENT_TIMEOUT_MS env var
    (default 5000 ms).  The connection is always rolled back on exit.
    """
    timeout_ms = _env_int("SQL_STATEMENT_TIMEOUT_MS", 5000)
    with _get_ro_pool().connection(timeout=5) as conn:
        try:
            with conn.cursor() as cur:
                cur.execute("BEGIN TRANSACTION READ ONLY")
                cur.execute(f"SET LOCAL statement_timeout = '{timeout_ms}'")
            yield conn
        finally:
            try:
                conn.rollback()
            except Exception:  # noqa: BLE001
                pass


def init_schema(conn: Connection | None = None) -> None:
    """No-op at runtime; schema is applied via Alembic migrations."""
