"""Tests for markdown_store upsert/list/count/delete operations."""
from __future__ import annotations

from unittest.mock import MagicMock, call, patch

import pytest


def _make_conn(rows=None, rowcount=0):
    """Return a minimal psycopg-style mock connection."""
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchone.return_value = {"count": len(rows)} if rows is not None else {"count": 0}
    cur.fetchall.return_value = rows or []
    cur.rowcount = rowcount
    conn.execute.return_value = cur
    return conn


def test_write_page_markdown_batch_calls_executemany(monkeypatch):
    from website_profiling.db import markdown_store as ms

    calls = []

    def fake_executemany(conn, sql, params, *, page_size=200):
        calls.append((sql, params))

    monkeypatch.setattr(ms, "_executemany", fake_executemany)
    conn = MagicMock()
    ms.write_page_markdown_batch(
        conn,
        [{"url": "https://example.com/a", "markdown": "# Hello", "word_count": 1}],
        crawl_run_id=5,
        property_id=2,
    )
    assert len(calls) == 1
    sql, params = calls[0]
    assert "crawl_page_markdown" in sql
    assert params[0][0] == 5  # crawl_run_id
    assert params[0][2] == 2  # property_id
    assert params[0][4] == "# Hello"  # markdown


def test_write_page_markdown_batch_skips_empty_records(monkeypatch):
    from website_profiling.db import markdown_store as ms

    calls = []
    monkeypatch.setattr(ms, "_executemany", lambda *a, **kw: calls.append(a))
    conn = MagicMock()
    ms.write_page_markdown_batch(conn, [], crawl_run_id=1)
    assert calls == []

    ms.write_page_markdown_batch(
        conn, [{"url": "", "markdown": "x"}], crawl_run_id=1
    )
    assert calls == []


def test_write_page_markdown_batch_normalizes_url(monkeypatch):
    from website_profiling.db import markdown_store as ms

    captured = []
    monkeypatch.setattr(ms, "_executemany", lambda conn, sql, rows, **kw: captured.extend(rows))
    conn = MagicMock()
    ms.write_page_markdown_batch(
        conn,
        [{"url": "https://example.com/a/", "markdown": "Text"}],
        crawl_run_id=1,
    )
    assert captured[0][1] == "https://example.com/a/"


def test_read_page_markdown_returns_dict():
    from website_profiling.db import markdown_store as ms

    row_data = {
        "url": "https://example.com/a",
        "title": "Test",
        "markdown": "# Test",
        "word_count": 1,
        "strategy": "main_only",
        "source_byte_length": 100,
        "extracted_at": "2025-01-01 00:00:00",
    }
    conn = _make_conn()
    conn.execute.return_value.fetchone.return_value = row_data
    result = ms.read_page_markdown(conn, 5, "https://example.com/a/")
    assert result == row_data


def test_read_page_markdown_returns_none_for_empty_url():
    from website_profiling.db import markdown_store as ms

    conn = MagicMock()
    result = ms.read_page_markdown(conn, 5, "")
    assert result is None
    conn.execute.assert_not_called()


def test_list_page_markdown_filters_by_query():
    from website_profiling.db import markdown_store as ms

    items = [{"url": "https://example.com/blog", "title": "Blog", "word_count": 5, "strategy": "main_only", "extracted_at": "2025-01-01"}]
    conn = MagicMock()
    count_cur = MagicMock()
    count_cur.fetchone.return_value = {"count": 1}
    data_cur = MagicMock()
    data_cur.fetchall.return_value = items
    conn.execute.side_effect = [count_cur, data_cur]

    result = ms.list_page_markdown(conn, 5, query="blog")
    assert result["total"] == 1
    assert result["items"] == items
    assert "lower(url) LIKE" in conn.execute.call_args_list[0][0][0]


def test_count_page_markdown_by_run_handles_exception():
    from website_profiling.db import markdown_store as ms

    conn = MagicMock()
    conn.execute.side_effect = Exception("boom")
    result = ms.count_page_markdown_by_run(conn, [3])
    assert result == {}


def test_read_page_markdown_returns_none_for_unknown():
    from website_profiling.db import markdown_store as ms

    conn = _make_conn()
    conn.execute.return_value.fetchone.return_value = None
    result = ms.read_page_markdown(conn, 5, "https://example.com/missing")
    assert result is None


def test_read_page_markdown_handles_exception():
    from website_profiling.db import markdown_store as ms

    conn = MagicMock()
    conn.execute.side_effect = Exception("db down")
    result = ms.read_page_markdown(conn, 1, "https://example.com")
    assert result is None


def test_list_page_markdown_returns_items_and_total():
    from website_profiling.db import markdown_store as ms

    items = [{"url": "https://example.com/a", "title": "A", "word_count": 5, "strategy": "main_only", "extracted_at": "2025-01-01"}]
    conn = MagicMock()
    count_cur = MagicMock()
    count_cur.fetchone.return_value = {"count": 1}
    data_cur = MagicMock()
    data_cur.fetchall.return_value = items
    conn.execute.side_effect = [count_cur, data_cur]

    result = ms.list_page_markdown(conn, 5)
    assert result["total"] == 1
    assert result["items"] == items


def test_list_page_markdown_handles_exception():
    from website_profiling.db import markdown_store as ms

    conn = MagicMock()
    conn.execute.side_effect = Exception("boom")
    result = ms.list_page_markdown(conn, 5)
    assert result == {"items": [], "total": 0, "limit": 25, "offset": 0}


def test_count_page_markdown_by_run():
    from website_profiling.db import markdown_store as ms

    rows = [{"crawl_run_id": 3, "cnt": 10}, {"crawl_run_id": 7, "cnt": 25}]
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = rows
    result = ms.count_page_markdown_by_run(conn, [3, 7])
    assert result == {3: 10, 7: 25}


def test_count_page_markdown_by_run_empty_list():
    from website_profiling.db import markdown_store as ms

    conn = MagicMock()
    result = ms.count_page_markdown_by_run(conn, [])
    assert result == {}
    conn.execute.assert_not_called()


def test_delete_page_markdown_for_run():
    from website_profiling.db import markdown_store as ms

    conn = MagicMock()
    conn.execute.return_value.rowcount = 42
    deleted = ms.delete_page_markdown_for_run(conn, 5)
    assert deleted == 42
    conn.commit.assert_called_once()


def test_delete_page_markdown_for_run_handles_exception():
    from website_profiling.db import markdown_store as ms

    conn = MagicMock()
    conn.execute.side_effect = Exception("boom")
    deleted = ms.delete_page_markdown_for_run(conn, 5)
    assert deleted == 0
