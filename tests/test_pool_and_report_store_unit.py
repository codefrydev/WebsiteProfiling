import os
import types
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

from tests.db_test_fakes import FakeConn


def test_get_database_url_appends_connect_timeout(monkeypatch) -> None:
    from website_profiling.db import pool

    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
    assert "connect_timeout=" in pool.get_database_url()

    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@localhost:5432/db?connect_timeout=1")
    assert pool.get_database_url().count("connect_timeout=") == 1


def test_canonical_domain_from_report_prefers_start_url(monkeypatch) -> None:
    from website_profiling.db import report_store

    # Patch get_crawl_run_info used inside report_store
    monkeypatch.setattr(report_store, "get_crawl_run_info", lambda _c, _rid: {"start_url": "https://Start.Example/path"})
    conn = FakeConn()
    domain = report_store._canonical_domain_from_report(conn, {"crawl_run_id": 1, "top_pages": [{"url": "https://x.com"}]})  # type: ignore[arg-type]
    assert domain == "start.example"


def test_canonical_domain_falls_back_to_top_pages(monkeypatch) -> None:
    from website_profiling.db import report_store

    monkeypatch.setattr(report_store, "get_crawl_run_info", lambda _c, _rid: None)
    conn = FakeConn()
    domain = report_store._canonical_domain_from_report(conn, {"top_pages": [{"url": "https://Top.Example/a"}]})  # type: ignore[arg-type]
    assert domain == "top.example"


def test_get_database_url_raises_when_missing(monkeypatch) -> None:
    from website_profiling.db.pool import get_database_url

    monkeypatch.delenv("DATABASE_URL", raising=False)
    import pytest

    with pytest.raises(RuntimeError):
        get_database_url()


def test_report_store_links_fallback_and_read_exception(monkeypatch) -> None:
    from website_profiling.db import report_store

    monkeypatch.setattr(report_store, "get_crawl_run_info", lambda _c, _rid: None)
    domain = report_store._canonical_domain_from_report(object(), {"links": [{"url": "https://fallback.com/p"}]})  # type: ignore[arg-type]
    assert domain == "fallback.com"

    class BoomConn:
        def execute(self, *_a, **_k):
            raise RuntimeError("x")

    assert report_store.read_report_payload(BoomConn()) is None  # type: ignore[arg-type]


# ── pool.py: RO pool and readonly_session ─────────────────────────────────────

def test_close_db_pool_closes_ro_pool_when_set(monkeypatch) -> None:
    """close_db_pool() must also close and clear _ro_pool."""
    from website_profiling.db import pool

    mock_ro = MagicMock()
    monkeypatch.setattr(pool, "_ro_pool", mock_ro)
    monkeypatch.setattr(pool, "_pool", None)
    pool.close_db_pool()
    mock_ro.close.assert_called_once()
    assert pool._ro_pool is None


def test_get_ro_pool_lazy_creates_and_caches(monkeypatch) -> None:
    """_get_ro_pool() creates a ConnectionPool on first call and reuses it."""
    from website_profiling.db import pool

    monkeypatch.setattr(pool, "_ro_pool", None)
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
    monkeypatch.delenv("DATABASE_URL_READONLY", raising=False)

    fake_pool = MagicMock()
    with patch("website_profiling.db.pool.ConnectionPool", return_value=fake_pool) as mock_cp:
        result = pool._get_ro_pool()
        # Second call must reuse — ConnectionPool not constructed again
        result2 = pool._get_ro_pool()

    assert result is fake_pool
    assert result2 is fake_pool
    mock_cp.assert_called_once()
    _, kwargs = mock_cp.call_args
    assert kwargs.get("kwargs", {}).get("autocommit") is True
    assert kwargs.get("min_size") == 1

    monkeypatch.setattr(pool, "_ro_pool", None)  # restore module state


def test_get_ro_pool_uses_readonly_url(monkeypatch) -> None:
    """When DATABASE_URL_READONLY is set, _get_ro_pool uses it."""
    from website_profiling.db import pool

    monkeypatch.setattr(pool, "_ro_pool", None)
    monkeypatch.setenv("DATABASE_URL", "postgres://rw:p@host/db")
    monkeypatch.setenv("DATABASE_URL_READONLY", "postgres://ro:p@host/db")

    fake_pool = MagicMock()
    with patch("website_profiling.db.pool.ConnectionPool", return_value=fake_pool) as mock_cp:
        pool._get_ro_pool()

    _, kwargs = mock_cp.call_args
    assert "ro:" in kwargs.get("conninfo", "")

    monkeypatch.setattr(pool, "_ro_pool", None)


def test_readonly_session_issues_read_only_begin(monkeypatch) -> None:
    """readonly_session() sends BEGIN TRANSACTION READ ONLY and rollbacks on exit."""
    from website_profiling.db import pool

    executed: list[str] = []
    fake_cursor = MagicMock()
    fake_cursor.execute.side_effect = lambda sql: executed.append(sql)

    cursor_ctx = MagicMock()
    cursor_ctx.__enter__ = MagicMock(return_value=fake_cursor)
    cursor_ctx.__exit__ = MagicMock(return_value=False)

    fake_conn = MagicMock()
    fake_conn.cursor.return_value = cursor_ctx

    @contextmanager
    def fake_connection(timeout):
        yield fake_conn

    fake_ro_pool = MagicMock()
    fake_ro_pool.connection = fake_connection

    with patch.object(pool, "_get_ro_pool", return_value=fake_ro_pool):
        with pool.readonly_session() as conn:
            assert conn is fake_conn

    assert any("BEGIN TRANSACTION READ ONLY" in s for s in executed)
    assert any("statement_timeout" in s for s in executed)
    fake_conn.rollback.assert_called_once()


def test_readonly_session_suppresses_rollback_error(monkeypatch) -> None:
    """readonly_session() must not propagate an exception from rollback()."""
    from website_profiling.db import pool

    fake_cursor = MagicMock()
    cursor_ctx = MagicMock()
    cursor_ctx.__enter__ = MagicMock(return_value=fake_cursor)
    cursor_ctx.__exit__ = MagicMock(return_value=False)

    fake_conn = MagicMock()
    fake_conn.cursor.return_value = cursor_ctx
    fake_conn.rollback.side_effect = OSError("connection gone")

    @contextmanager
    def fake_connection(timeout):
        yield fake_conn

    fake_ro_pool = MagicMock()
    fake_ro_pool.connection = fake_connection

    with patch.object(pool, "_get_ro_pool", return_value=fake_ro_pool):
        with pool.readonly_session():  # must not raise
            pass

