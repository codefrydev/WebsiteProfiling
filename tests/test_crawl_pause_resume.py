"""Tests for crawl pause/resume: frontier serialisation, pause state DB helpers,
and the pause/resume flow in run_crawler."""
from __future__ import annotations

import json
import os
import threading
from queue import Queue
from typing import Any
from unittest.mock import MagicMock, patch, call

import pandas as pd
import pytest


# ---------------------------------------------------------------------------
# CrawlFrontier.serialize_state / restore_from_state
# ---------------------------------------------------------------------------

def _make_frontier() -> Any:
    from website_profiling.crawl.frontier import CrawlFrontier

    with patch("website_profiling.crawl.frontier.load_robots", return_value=None):
        f = CrawlFrontier("https://example.com", ignore_robots=True)
    return f


def test_serialize_state_empty():
    f = _make_frontier()
    state = f.serialize_state()
    assert state["pending"] == []
    assert state["visited"] == []
    assert state["depths"] == {}


def test_serialize_state_captures_pending_and_visited():
    f = _make_frontier()
    f.queue.put("https://example.com/a")
    f.queue.put("https://example.com/b")
    f.depths["https://example.com/a"] = 0
    f.depths["https://example.com/b"] = 1
    f.visited.add("https://example.com/visited")

    state = f.serialize_state()
    assert set(state["pending"]) == {"https://example.com/a", "https://example.com/b"}
    assert "https://example.com/visited" in state["visited"]
    assert state["depths"]["https://example.com/a"] == 0
    assert state["depths"]["https://example.com/b"] == 1


def test_restore_from_state_populates_frontier():
    f = _make_frontier()
    state = {
        "pending": ["https://example.com/x", "https://example.com/y"],
        "visited": ["https://example.com/z"],
        "depths": {"https://example.com/x": 0, "https://example.com/y": 1},
    }
    f.restore_from_state(state)

    assert not f.queue.empty()
    items = list(f.queue.queue)
    assert set(items) == {"https://example.com/x", "https://example.com/y"}
    assert "https://example.com/z" in f.visited
    assert f.depths["https://example.com/x"] == 0


def test_restore_from_state_empty_state():
    f = _make_frontier()
    f.restore_from_state({})
    assert f.queue.empty()
    assert len(f.visited) == 0
    assert len(f.depths) == 0


def test_serialize_restore_roundtrip():
    f = _make_frontier()
    f.queue.put("https://example.com/page")
    f.depths["https://example.com/page"] = 2
    f.visited.add("https://example.com/done")

    state = f.serialize_state()
    serialised = json.dumps(state)  # must be JSON-serialisable

    f2 = _make_frontier()
    f2.restore_from_state(json.loads(serialised))
    assert list(f2.queue.queue) == ["https://example.com/page"]
    assert "https://example.com/done" in f2.visited


# ---------------------------------------------------------------------------
# crawl_store: save_pause_state / load_pause_state / clear_pause_state
# ---------------------------------------------------------------------------

def _mock_conn():
    conn = MagicMock()
    conn.execute.return_value = MagicMock()
    return conn


def test_save_pause_state_executes_update():
    from website_profiling.db.crawl_store import save_pause_state

    conn = _mock_conn()
    state = {"pending": ["https://example.com/a"], "visited": [], "depths": {}}
    save_pause_state(conn, 42, state)

    args = conn.execute.call_args
    sql = args[0][0]
    assert "UPDATE crawl_runs SET pause_state" in sql
    assert "paused_at" in sql
    conn.commit.assert_called_once()


def test_load_pause_state_returns_dict():
    from website_profiling.db.crawl_store import load_pause_state

    state = {"pending": ["https://example.com/a"], "visited": [], "depths": {}}
    row = MagicMock()
    row.__getitem__ = lambda self, k: json.dumps(state) if k == "pause_state" else None
    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = row

    result = load_pause_state(conn, 42)
    assert result == state


def test_load_pause_state_returns_none_when_null():
    from website_profiling.db.crawl_store import load_pause_state

    row = MagicMock()
    row.__getitem__ = lambda self, k: None
    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = row

    assert load_pause_state(conn, 42) is None


def test_load_pause_state_returns_none_when_no_row():
    from website_profiling.db.crawl_store import load_pause_state

    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = None

    assert load_pause_state(conn, 42) is None


def test_load_pause_state_returns_none_on_exception():
    from website_profiling.db.crawl_store import load_pause_state

    conn = _mock_conn()
    conn.execute.side_effect = Exception("db error")

    assert load_pause_state(conn, 42) is None


def test_load_pause_state_accepts_dict_value():
    """Column value already a dict (psycopg JSONB auto-parse)."""
    from website_profiling.db.crawl_store import load_pause_state

    state = {"pending": [], "visited": [], "depths": {}}
    row = MagicMock()
    row.__getitem__ = lambda self, k: state if k == "pause_state" else None
    conn = _mock_conn()
    conn.execute.return_value.fetchone.return_value = row

    result = load_pause_state(conn, 7)
    assert result == state


def test_clear_pause_state_executes_update():
    from website_profiling.db.crawl_store import clear_pause_state

    conn = _mock_conn()
    clear_pause_state(conn, 42)

    args = conn.execute.call_args
    sql = args[0][0]
    assert "pause_state = NULL" in sql
    conn.commit.assert_called_once()


def test_clear_pause_state_swallows_exception():
    from website_profiling.db.crawl_store import clear_pause_state

    conn = _mock_conn()
    conn.execute.side_effect = Exception("db down")
    clear_pause_state(conn, 42)  # must not raise


# ---------------------------------------------------------------------------
# Crawler.__init__ restore_from_state branch (line 255 coverage)
# ---------------------------------------------------------------------------

def test_crawler_init_restores_pause_state(monkeypatch):
    """Passing pause_state to Crawler.__init__ calls frontier.restore_from_state."""
    import website_profiling.crawl.crawler as mod

    restored = {}

    class _FakeFrontier:
        queue = Queue()
        visited: set = set()
        depths: dict = {}
        lock = threading.Lock()
        rp = None

        def __init__(self, *a, **kw):
            pass

        def restore_from_state(self, state):
            restored["state"] = state

        def seed_initial_urls(self, **kw):
            pass

        def note_dequeued(self, url):
            pass

    pause_state = {"pending": ["https://example.com/p"], "visited": [], "depths": {}}

    with (
        patch.object(mod, "CrawlFrontier", _FakeFrontier),
        patch.object(mod, "build_fetcher", return_value=MagicMock()),
    ):
        c = mod.Crawler("https://example.com", pause_state=pause_state)

    assert restored.get("state") == pause_state


# ---------------------------------------------------------------------------
# _PAUSE_EVENT and pause file check in crawl loop
# ---------------------------------------------------------------------------

def test_pause_event_is_set_by_pause_file(tmp_path, monkeypatch):
    """Crawler.crawl() detects a pause file written to TMPDIR and marks paused=True."""
    import website_profiling.crawl.crawler as mod
    from website_profiling.crawl.schema import empty_crawl_row

    monkeypatch.setenv("TMPDIR", str(tmp_path))
    mod._PAUSE_EVENT.clear()

    pid = os.getpid()
    flag = tmp_path / f"wp_pause_{pid}.flag"
    flag.write_text("")  # write BEFORE crawl starts

    # Minimal real Crawler setup — mocked frontier with one URL queued.
    class _FakeFrontier:
        queue: Queue = Queue()
        visited: set = set()
        depths: dict = {}
        lock = threading.Lock()
        rp = None

        def __init__(self, *a, **kw):
            self.queue.put("https://example.com/")
            self.depths["https://example.com/"] = 0

        def should_skip_dequeued(self, url):
            return False

        def mark_visited(self, url):
            if url in self.visited:
                return False
            self.visited.add(url)
            return True

        def seed_initial_urls(self, **kw):
            pass

        def note_dequeued(self, url):
            pass

        def serialize_state(self):
            return {"pending": [], "visited": [], "depths": {}}

    fake_result = empty_crawl_row(status=200)
    fake_result["url"] = "https://example.com/"

    mock_fetcher = MagicMock()
    mock_fetcher.fetch.return_value = MagicMock(
        url="https://example.com/",
        final_url="https://example.com/",
        status_code=200,
        text="<html></html>",
        content_type="text/html",
        fetch_method="static",
        console_messages=[],
        failed_requests=[],
    )
    mock_fetcher.close = MagicMock()

    with (
        patch.object(mod, "CrawlFrontier", _FakeFrontier),
        patch.object(mod, "build_fetcher", return_value=mock_fetcher),
        patch.object(mod.Crawler, "worker", return_value=fake_result),
    ):
        crawler = mod.Crawler("https://example.com", max_pages=10)
        df = crawler.crawl(show_progress=False)

    assert crawler.paused is True
    assert not flag.exists()  # file was deleted
    mod._PAUSE_EVENT.clear()


def test_pause_drains_inflight_futures(tmp_path, monkeypatch):
    """In-flight futures must be collected on pause, not silently dropped.

    Regression: previously the loop broke immediately on pause, abandoning
    futures that were still running. Their URLs are already marked visited, so a
    resumed crawl never refetches them — they vanished from results and the DB.
    """
    import time

    import website_profiling.crawl.crawler as mod
    from website_profiling.crawl.schema import empty_crawl_row

    monkeypatch.setenv("TMPDIR", str(tmp_path))
    mod._PAUSE_EVENT.clear()

    pid = os.getpid()
    flag = tmp_path / f"wp_pause_{pid}.flag"
    flag.write_text("")  # pause requested before the crawl starts

    class _FakeFrontier:
        def __init__(self, *a, **kw):
            self.queue: Queue = Queue()
            self.visited: set = set()
            self.depths: dict = {}
            self.lock = threading.Lock()
            self.rp = None
            self.queue.put("https://example.com/fast")
            self.queue.put("https://example.com/slow")

        def should_skip_dequeued(self, url):
            return False

        def mark_visited(self, url):
            if url in self.visited:
                return False
            self.visited.add(url)
            return True

        def seed_initial_urls(self, **kw):
            pass

        def note_dequeued(self, url):
            pass

        def serialize_state(self):
            return {"pending": [], "visited": [], "depths": {}}

    def _worker(url):
        # The "slow" page is still in-flight when the "fast" future completes and
        # the pause is detected, so it must be drained rather than dropped.
        if url.endswith("/slow"):
            time.sleep(0.4)
        row = empty_crawl_row(status=200)
        row["url"] = url
        return row

    mock_fetcher = MagicMock()
    mock_fetcher.close = MagicMock()

    with (
        patch.object(mod, "CrawlFrontier", _FakeFrontier),
        patch.object(mod, "build_fetcher", return_value=mock_fetcher),
        patch.object(mod.Crawler, "worker", side_effect=_worker),
    ):
        crawler = mod.Crawler("https://example.com", max_pages=10)
        df = crawler.crawl(show_progress=False)

    mod._PAUSE_EVENT.clear()

    assert crawler.paused is True
    urls = set(df["url"].tolist())
    assert "https://example.com/fast" in urls
    assert "https://example.com/slow" in urls  # dropped before the drain fix


def test_pause_loop_os_unlink_error_is_swallowed(tmp_path, monkeypatch):
    """OSError from os.unlink during pause-file cleanup is silently swallowed."""
    import website_profiling.crawl.crawler as mod
    from website_profiling.crawl.schema import empty_crawl_row

    monkeypatch.setenv("TMPDIR", str(tmp_path))
    mod._PAUSE_EVENT.clear()

    pid = os.getpid()
    flag = tmp_path / f"wp_pause_{pid}.flag"
    flag.write_text("")

    class _FakeFrontier:
        queue: Queue = Queue()
        visited: set = set()
        depths: dict = {}
        lock = threading.Lock()
        rp = None

        def __init__(self, *a, **kw):
            self.queue.put("https://example.com/")
            self.depths["https://example.com/"] = 0

        def should_skip_dequeued(self, url):
            return False

        def mark_visited(self, url):
            if url in self.visited:
                return False
            self.visited.add(url)
            return True

        def seed_initial_urls(self, **kw):
            pass

        def note_dequeued(self, url):
            pass

        def serialize_state(self):
            return {"pending": [], "visited": [], "depths": {}}

    fake_result = empty_crawl_row(status=200)
    fake_result["url"] = "https://example.com/"

    mock_fetcher = MagicMock()
    mock_fetcher.close = MagicMock()

    with (
        patch.object(mod, "CrawlFrontier", _FakeFrontier),
        patch.object(mod, "build_fetcher", return_value=mock_fetcher),
        patch.object(mod.Crawler, "worker", return_value=fake_result),
        patch("os.unlink", side_effect=OSError("permission denied")),
    ):
        crawler = mod.Crawler("https://example.com", max_pages=10)
        df = crawler.crawl(show_progress=False)

    assert crawler.paused is True
    mod._PAUSE_EVENT.clear()


# ---------------------------------------------------------------------------
# run_crawler: pause saves state and calls sys.exit(2)
# ---------------------------------------------------------------------------

def _patch_crawler_paused(monkeypatch, pause_state_to_save=None):
    """Return a fake Crawler class whose crawl() immediately marks itself paused."""
    import website_profiling.crawl.crawler as mod

    class _FakeCrawler:
        paused = True
        results = [{"url": "https://example.com/a"}]
        link_edges_accum = []
        frontier = MagicMock()
        _html_buffer = []
        store_page_html = False

        def __init__(self, *a, **kw):
            self.frontier.serialize_state.return_value = pause_state_to_save or {
                "pending": ["https://example.com/b"],
                "visited": ["https://example.com/a"],
                "depths": {"https://example.com/b": 1},
            }

        def crawl(self, **kw):
            return pd.DataFrame(self.results)

    return _FakeCrawler


def _db_session_cm(conn):
    """Return a callable context-manager mock that yields *conn*."""
    from contextlib import contextmanager

    @contextmanager
    def _cm():
        yield conn

    return _cm


def test_run_crawler_pause_saves_state_and_exits(monkeypatch):
    import website_profiling.crawl.crawler as mod
    import website_profiling.db as db_pkg

    FakeCrawler = _patch_crawler_paused(monkeypatch)

    saved = {}

    def _fake_save(conn, run_id, state):
        saved["run_id"] = run_id
        saved["state"] = state

    mock_conn = MagicMock()

    with (
        patch.object(mod, "Crawler", FakeCrawler),
        patch.object(db_pkg, "db_session", _db_session_cm(mock_conn)),
        patch.object(db_pkg, "create_crawl_run", return_value=7),
        patch.object(db_pkg, "backup_db_if_exists", return_value=None),
        patch.object(db_pkg, "read_historical_data", return_value={}),
        patch.object(db_pkg, "restore_historical_data", MagicMock()),
        patch("website_profiling.db.storage.ensure_crawl_tables_cleared", MagicMock()),
        patch("website_profiling.db.crawl_store.save_pause_state", _fake_save),
        pytest.raises(SystemExit) as exc_info,
    ):
        mod.run_crawler(
            start_url="https://example.com",
            output_db=True,
            crawl_stream_to_db=True,
        )

    assert exc_info.value.code == 2
    assert saved.get("run_id") == 7
    assert "pending" in saved.get("state", {})


def test_run_crawler_pause_no_stream_run_id_still_exits(monkeypatch):
    """When streaming wasn't used (stream_run_id=None) pause still calls sys.exit(2)."""
    import website_profiling.crawl.crawler as mod

    FakeCrawler = _patch_crawler_paused(monkeypatch)

    with (
        patch.object(mod, "Crawler", FakeCrawler),
        pytest.raises(SystemExit) as exc_info,
    ):
        mod.run_crawler(
            start_url="https://example.com",
            output_db=False,
        )

    assert exc_info.value.code == 2


# ---------------------------------------------------------------------------
# run_crawler: resume loads state and clears it on success
# ---------------------------------------------------------------------------

def test_run_crawler_resume_loads_and_clears_state(monkeypatch):
    import website_profiling.crawl.crawler as mod
    import website_profiling.db as db_pkg

    pause_state = {
        "pending": ["https://example.com/b"],
        "visited": ["https://example.com/a"],
        "depths": {"https://example.com/b": 1},
        "pages_crawled": 1,
    }
    cleared = {}

    def _fake_load(conn, run_id):
        return pause_state

    def _fake_clear(conn, run_id):
        cleared["run_id"] = run_id

    class _FakeCrawlerNotPaused:
        paused = False
        results = []
        link_edges_accum = []
        frontier = MagicMock()
        _html_buffer = []
        store_page_html = False

        def __init__(self, *a, **kw):
            self._pause_state = kw.get("pause_state")

        def crawl(self, **kw):
            return pd.DataFrame()

    mock_conn = MagicMock()

    with (
        patch.object(mod, "Crawler", _FakeCrawlerNotPaused),
        patch.object(db_pkg, "db_session", _db_session_cm(mock_conn)),
        patch("website_profiling.db.crawl_store.load_pause_state", _fake_load),
        patch("website_profiling.db.crawl_store.clear_pause_state", _fake_clear),
    ):
        mod.run_crawler(
            start_url="https://example.com",
            output_db=False,
            resume_run_id=42,
        )

    assert cleared.get("run_id") == 42


def test_run_crawler_resume_with_no_saved_state(monkeypatch):
    """If no pause state exists for resume_run_id the crawler starts fresh."""
    import website_profiling.crawl.crawler as mod
    import website_profiling.db as db_pkg

    class _FakeCrawlerFresh:
        paused = False
        results = []
        link_edges_accum = []
        frontier = MagicMock()
        _html_buffer = []
        store_page_html = False

        def __init__(self, *a, **kw):
            assert kw.get("pause_state") is None

        def crawl(self, **kw):
            return pd.DataFrame()

    mock_conn = MagicMock()

    with (
        patch.object(mod, "Crawler", _FakeCrawlerFresh),
        patch.object(db_pkg, "db_session", _db_session_cm(mock_conn)),
        patch("website_profiling.db.crawl_store.load_pause_state", return_value=None),
        patch("website_profiling.db.crawl_store.clear_pause_state"),
    ):
        mod.run_crawler(
            start_url="https://example.com",
            output_db=False,
            resume_run_id=99,
        )


def test_run_crawler_resume_reuses_run_id_and_skips_create(monkeypatch):
    """Resume with saved pause state streams into the existing crawl_run_id."""
    import website_profiling.crawl.crawler as mod
    import website_profiling.db as db_pkg

    pause_state = {
        "pending": ["https://example.com/b"],
        "visited": ["https://example.com/a"],
        "depths": {"https://example.com/b": 1},
        "pages_crawled": 1,
    }
    stream_ids: list[int | None] = []
    create_calls: list[int] = []

    class _FakeCrawlerResume:
        paused = False
        results = [{"url": "https://example.com/a"}]
        link_edges_accum = []
        frontier = MagicMock()
        _html_buffer = []
        store_page_html = False

        def __init__(self, *a, **kw):
            assert kw.get("pause_state") == pause_state

        def crawl(self, **kw):
            stream_ids.append(kw.get("stream_crawl_run_id"))
            return pd.DataFrame(self.results)

    mock_conn = MagicMock()

    def _fake_create(*_a, **_k):
        create_calls.append(1)
        return 999

    with (
        patch.object(mod, "Crawler", _FakeCrawlerResume),
        patch.object(db_pkg, "db_session", _db_session_cm(mock_conn)),
        patch.object(db_pkg, "create_crawl_run", side_effect=_fake_create),
        patch.object(db_pkg, "backup_db_if_exists", return_value=None),
        patch.object(db_pkg, "read_historical_data", return_value={}),
        patch.object(db_pkg, "restore_historical_data", MagicMock()),
        patch("website_profiling.db.storage.ensure_crawl_tables_cleared", MagicMock()),
        patch("website_profiling.db.crawl_store.load_pause_state", return_value=pause_state),
        patch("website_profiling.db.crawl_store.clear_pause_state", MagicMock()),
    ):
        mod.run_crawler(
            start_url="https://example.com",
            output_db=True,
            resume_run_id=42,
        )

    assert stream_ids == [42]
    assert create_calls == []


def test_run_crawler_output_db_always_streams(monkeypatch):
    """output_db=True always creates a stream_run_id so pause can persist frontier."""
    import website_profiling.crawl.crawler as mod
    import website_profiling.db as db_pkg

    stream_ids: list[int | None] = []

    class _FakeCrawler:
        paused = False
        results = [{"url": "https://example.com/"}]
        link_edges_accum = []
        frontier = MagicMock()
        _html_buffer = []
        store_page_html = False

        def __init__(self, *a, **kw):
            pass

        def crawl(self, **kw):
            stream_ids.append(kw.get("stream_crawl_run_id"))
            return pd.DataFrame(self.results)

    mock_conn = MagicMock()

    with (
        patch.object(mod, "Crawler", _FakeCrawler),
        patch.object(db_pkg, "db_session", _db_session_cm(mock_conn)),
        patch.object(db_pkg, "create_crawl_run", return_value=55),
        patch.object(db_pkg, "backup_db_if_exists", return_value=None),
        patch.object(db_pkg, "read_historical_data", return_value={}),
        patch.object(db_pkg, "restore_historical_data", MagicMock()),
        patch("website_profiling.db.storage.ensure_crawl_tables_cleared", MagicMock()),
    ):
        mod.run_crawler(
            start_url="https://example.com",
            output_db=True,
            crawl_stream_to_db=False,
            max_pages=5,
            preserve_crawl_history=True,
        )

    assert stream_ids == [55]
