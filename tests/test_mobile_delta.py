"""Tests for mobile vs desktop delta computation in crawl_store."""
from __future__ import annotations

from unittest.mock import MagicMock, patch
from types import SimpleNamespace

import pandas as pd

from website_profiling.db.crawl_store import (
    get_mobile_run_id,
    read_mobile_desktop_delta,
    set_mobile_run_id,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_conn(mobile_run_id_val, desktop_rows=None, mobile_rows=None):
    """Build a mock psycopg2 connection that returns canned data."""
    conn = MagicMock()

    def _execute(sql, params=()):
        cur = MagicMock()
        sql_stripped = sql.strip().lower()
        if "mobile_run_id" in sql_stripped and "crawl_results" not in sql_stripped:
            # get_mobile_run_id query
            row = MagicMock()
            row.__getitem__ = lambda self, k: mobile_run_id_val
            row.keys.return_value = ["mobile_run_id"]
            cur.fetchone.return_value = row if mobile_run_id_val is not None else None
        elif "crawl_results" in sql_stripped:
            rid = params[0] if params else None
            rows_data = desktop_rows if rid == 1 else (mobile_rows or [])
            if rows_data is None:
                rows_data = []
            mock_rows = []
            for r in rows_data:
                mr = MagicMock()
                mr.__getitem__ = lambda self, k, _r=r: _r.get(k)
                mr.keys.return_value = list(r.keys())
                mock_rows.append(mr)
            cur.fetchall.return_value = mock_rows
        return cur

    conn.execute.side_effect = _execute
    return conn


# ---------------------------------------------------------------------------
# set_mobile_run_id
# ---------------------------------------------------------------------------

def test_set_mobile_run_id_executes_update():
    conn = MagicMock()
    set_mobile_run_id(conn, desktop_run_id=1, mobile_run_id=2)
    conn.execute.assert_called_once()
    sql, params = conn.execute.call_args[0]
    assert "mobile_run_id" in sql.lower()
    assert params == (2, 1)
    conn.commit.assert_called_once()


# ---------------------------------------------------------------------------
# get_mobile_run_id
# ---------------------------------------------------------------------------

def test_get_mobile_run_id_returns_value():
    conn = MagicMock()
    row = MagicMock()
    row.__getitem__ = lambda self, k: 42
    row.keys.return_value = ["mobile_run_id"]
    conn.execute.return_value.fetchone.return_value = row
    assert get_mobile_run_id(conn, 1) == 42


def test_get_mobile_run_id_returns_none_when_null():
    conn = MagicMock()
    row = MagicMock()
    row.__getitem__ = lambda self, k: None
    row.keys.return_value = ["mobile_run_id"]
    conn.execute.return_value.fetchone.return_value = row
    assert get_mobile_run_id(conn, 1) is None


def test_get_mobile_run_id_returns_none_when_no_row():
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = None
    assert get_mobile_run_id(conn, 999) is None


def test_get_mobile_run_id_returns_none_on_exception():
    conn = MagicMock()
    conn.execute.side_effect = Exception("db error")
    assert get_mobile_run_id(conn, 1) is None


# ---------------------------------------------------------------------------
# read_mobile_desktop_delta
# ---------------------------------------------------------------------------

def _desktop_df():
    return pd.DataFrame([
        {"url": "https://ex.com/a", "title": "Desktop A", "h1": "Heading A", "word_count": 300, "status": 200, "fetch_method": "static"},
        {"url": "https://ex.com/b", "title": "Same Title", "h1": "Same H1",  "word_count": 100, "status": 200, "fetch_method": "static"},
        {"url": "https://ex.com/c", "title": "Desktop C", "h1": "H1 C",      "word_count": 200, "status": 200, "fetch_method": "static"},
    ])


def _mobile_df():
    return pd.DataFrame([
        {"url": "https://ex.com/a", "title": "Mobile A",  "h1": "Heading A", "word_count": 300, "status": 200, "fetch_method": "static"},
        {"url": "https://ex.com/b", "title": "Same Title", "h1": "Same H1",  "word_count": 100, "status": 200, "fetch_method": "static"},
        {"url": "https://ex.com/c", "title": "Desktop C", "h1": "H1 C",      "word_count": 200, "status": 404, "fetch_method": "static"},
    ])


def test_read_mobile_desktop_delta_no_mobile_run():
    conn = MagicMock()
    row = MagicMock()
    row.__getitem__ = lambda self, k: None
    row.keys.return_value = ["mobile_run_id"]
    conn.execute.return_value.fetchone.return_value = row
    assert read_mobile_desktop_delta(conn, 1) == []


def test_read_mobile_desktop_delta_returns_deltas():
    conn = MagicMock()

    with (
        patch("website_profiling.db.crawl_store.get_mobile_run_id", return_value=2),
        patch("website_profiling.db.crawl_store.read_crawl") as mock_read,
    ):
        mock_read.side_effect = [_desktop_df(), _mobile_df()]
        result = read_mobile_desktop_delta(conn, 1)

    # /a: title differs → included
    # /b: no diff → excluded
    # /c: status differs → included
    assert len(result) == 2
    urls = {r["url"] for r in result}
    assert any("ex.com/a" in u for u in urls)
    assert any("ex.com/c" in u for u in urls)


def test_read_mobile_desktop_delta_title_diff_flagged():
    conn = MagicMock()
    with (
        patch("website_profiling.db.crawl_store.get_mobile_run_id", return_value=2),
        patch("website_profiling.db.crawl_store.read_crawl") as mock_read,
    ):
        mock_read.side_effect = [_desktop_df(), _mobile_df()]
        result = read_mobile_desktop_delta(conn, 1)

    a = next(r for r in result if "ex.com/a" in r["url"])
    assert a["title_differs"] is True
    assert a["desktop"]["title"] == "Desktop A"
    assert a["mobile"]["title"] == "Mobile A"


def test_read_mobile_desktop_delta_status_diff_sorts_first():
    conn = MagicMock()
    with (
        patch("website_profiling.db.crawl_store.get_mobile_run_id", return_value=2),
        patch("website_profiling.db.crawl_store.read_crawl") as mock_read,
    ):
        mock_read.side_effect = [_desktop_df(), _mobile_df()]
        result = read_mobile_desktop_delta(conn, 1)

    # /c has status_diff (4 pts) > /a has only title_diff (2 pts)
    assert "ex.com/c" in result[0]["url"]


def test_read_mobile_desktop_delta_word_count_threshold():
    conn = MagicMock()
    desktop = pd.DataFrame([{"url": "https://ex.com/x", "title": "T", "h1": "H", "word_count": 100, "status": 200, "fetch_method": "static"}])
    # delta = 51 → included
    mobile_over = pd.DataFrame([{"url": "https://ex.com/x", "title": "T", "h1": "H", "word_count": 151, "status": 200, "fetch_method": "static"}])
    # delta = 50 → excluded
    mobile_under = pd.DataFrame([{"url": "https://ex.com/x", "title": "T", "h1": "H", "word_count": 150, "status": 200, "fetch_method": "static"}])

    with (
        patch("website_profiling.db.crawl_store.get_mobile_run_id", return_value=2),
        patch("website_profiling.db.crawl_store.read_crawl") as mock_read,
    ):
        mock_read.side_effect = [desktop.copy(), mobile_over.copy()]
        result_over = read_mobile_desktop_delta(conn, 1)

    with (
        patch("website_profiling.db.crawl_store.get_mobile_run_id", return_value=2),
        patch("website_profiling.db.crawl_store.read_crawl") as mock_read,
    ):
        mock_read.side_effect = [desktop.copy(), mobile_under.copy()]
        result_under = read_mobile_desktop_delta(conn, 1)

    assert len(result_over) == 1
    assert len(result_under) == 0


def test_read_mobile_desktop_delta_empty_dfs():
    conn = MagicMock()
    with (
        patch("website_profiling.db.crawl_store.get_mobile_run_id", return_value=2),
        patch("website_profiling.db.crawl_store.read_crawl") as mock_read,
    ):
        mock_read.side_effect = [pd.DataFrame(), pd.DataFrame()]
        assert read_mobile_desktop_delta(conn, 1) == []


def test_read_mobile_desktop_delta_non_numeric_word_count():
    """_int() except branch: non-numeric word_count treated as 0."""
    conn = MagicMock()
    desktop = pd.DataFrame([{"url": "https://ex.com/x", "title": "T", "h1": "H", "word_count": "bad", "status": 200, "fetch_method": "static"}])
    mobile = pd.DataFrame([{"url": "https://ex.com/x", "title": "T", "h1": "H", "word_count": "also-bad", "status": 200, "fetch_method": "static"}])
    with (
        patch("website_profiling.db.crawl_store.get_mobile_run_id", return_value=2),
        patch("website_profiling.db.crawl_store.read_crawl") as mock_read,
    ):
        mock_read.side_effect = [desktop, mobile]
        # Both map to 0 word_count → delta = 0 → excluded (no other diffs)
        assert read_mobile_desktop_delta(conn, 1) == []


def test_read_mobile_desktop_delta_url_only_in_one_run():
    """URLs present in only one run are skipped."""
    conn = MagicMock()
    desktop = pd.DataFrame([{"url": "https://ex.com/d-only", "title": "D", "h1": "", "word_count": 0, "status": 200, "fetch_method": "static"}])
    mobile = pd.DataFrame([{"url": "https://ex.com/m-only", "title": "M", "h1": "", "word_count": 0, "status": 200, "fetch_method": "static"}])
    with (
        patch("website_profiling.db.crawl_store.get_mobile_run_id", return_value=2),
        patch("website_profiling.db.crawl_store.read_crawl") as mock_read,
    ):
        mock_read.side_effect = [desktop, mobile]
        assert read_mobile_desktop_delta(conn, 1) == []
