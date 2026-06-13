"""Tests for crawl_page_html storage."""
from __future__ import annotations

import pytest

from website_profiling.db import html_store as hs


class _Cursor:
    def __init__(self, rows=None):
        self._rows = rows or []
        self.executemany_calls: list[tuple] = []

    def executemany(self, sql, params):
        self.executemany_calls.append((sql, params))

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._rows[0] if self._rows else None


class _Conn:
    def __init__(self, select_rows=None):
        self.select_rows = select_rows or []
        self.executed: list[tuple] = []
        self.commits = 0
        self.executemany_calls: list[tuple] = []
        self._cursor = _Cursor()

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        if "SELECT" in sql.upper():
            self._cursor = _Cursor(self.select_rows)
        return self._cursor

    def commit(self):
        self.commits += 1

    def cursor(self):
        cur = _Cursor()
        cur.executemany_calls = self.executemany_calls

        class _CM:
            def __enter__(self_inner):
                return cur

            def __exit__(self_inner, _t, _v, _tb):
                return False

        return _CM()


def test_write_page_html_batch_builds_rows_and_commits() -> None:
    conn = _Conn()
    records = [
        {
            "url": "https://example.com/page",
            "html": "<html><body>Hello</body></html>",
            "status": "200",
            "content_type": "text/html",
            "fetch_method": "rendered",
            "byte_length": 32,
        }
    ]
    hs.write_page_html_batch(conn, records, crawl_run_id=7, commit=True)
    assert conn.commits == 1
    assert len(conn.executemany_calls) == 1
    _sql, params = conn.executemany_calls[0]
    assert "crawl_page_html" in _sql
    assert params[0][0] == 7
    assert params[0][1] == "https://example.com/page"


def test_write_page_html_batch_skips_empty_html() -> None:
    conn = _Conn()
    hs.write_page_html_batch(conn, [{"url": "https://x.com", "html": ""}], crawl_run_id=1)
    assert conn.commits == 0
    assert not conn.executed


def test_read_page_html_returns_row() -> None:
    row = {
        "url": "https://example.com",
        "html": "<html></html>",
        "status": "200",
        "content_type": "text/html",
        "fetch_method": "static",
        "byte_length": 13,
        "captured_at": "2026-01-01",
    }
    conn = _Conn(select_rows=[row])
    out = hs.read_page_html(conn, 3, "https://example.com/")
    assert out is not None
    assert out["html"] == "<html></html>"


def test_read_page_html_for_run_yields_rows() -> None:
    rows = [
        {"url": "https://a.com", "html": "<html>a</html>", "status": "200",
         "content_type": "text/html", "fetch_method": "static", "byte_length": 1, "captured_at": "t"},
    ]
    conn = _Conn(select_rows=rows)
    got = list(hs.read_page_html_for_run(conn, 1, limit=10))
    assert len(got) == 1
    assert got[0]["url"] == "https://a.com"


def test_delete_page_html_for_run() -> None:
    conn = _Conn()
    hs.delete_page_html_for_run(conn, 9, commit=True)
    assert conn.commits == 1
    assert any("DELETE FROM crawl_page_html" in sql for sql, _ in conn.executed)


def test_read_page_html_empty_url_returns_none() -> None:
    conn = _Conn()
    assert hs.read_page_html(conn, 1, "") is None


def test_read_page_html_returns_none_when_missing() -> None:
    conn = _Conn(select_rows=[])
    assert hs.read_page_html(conn, 3, "https://missing.example") is None


def test_read_page_html_handles_db_error() -> None:
    class _BadConn:
        def execute(self, *_a, **_k):
            raise RuntimeError("db down")

    assert hs.read_page_html(_BadConn(), 1, "https://example.com") is None  # type: ignore[arg-type]


def test_read_page_html_for_run_handles_db_error() -> None:
    class _BadConn:
        def execute(self, *_a, **_k):
            raise RuntimeError("db down")

    assert list(hs.read_page_html_for_run(_BadConn(), 1)) == []  # type: ignore[arg-type]


def test_delete_page_html_for_run_handles_db_error() -> None:
    class _BadConn:
        def execute(self, *_a, **_k):
            raise RuntimeError("db down")

        def commit(self):
            raise RuntimeError("should not commit")

    hs.delete_page_html_for_run(_BadConn(), 1, commit=True)  # type: ignore[arg-type]
