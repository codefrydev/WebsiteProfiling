from __future__ import annotations

import json
import types

import pandas as pd


def test_worker_success_path_populates_many_fields(monkeypatch):
    import website_profiling.crawl.crawler as mod
    import website_profiling.crawl.page_record as pr_mod
    from website_profiling.crawl.fetchers.base import FetchResult

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        allow_external=False,
        use_wappalyzer=False,
        store_outlinks=True,
        max_depth=2,
    )
    c.fetch = lambda _url: FetchResult(  # type: ignore[method-assign]
        status=200,
        content_type="text/html",
        text="<html><body>ok</body></html>",
        response_time_ms=12,
        content_length=100,
        final_url="https://site.com/page",
        headers_dict={"X-Robots-Tag": ""},
        redirect_chain_length=0,
        fetch_method="static",
    )
    monkeypatch.setattr(
        pr_mod,
        "parse_link_edges",
        lambda _u, _t: (
            "T",
            [
                {"to_url": "https://site.com/a", "anchor_text": "a", "rel": "", "is_nofollow": False, "is_sponsored": False, "is_ugc": False, "link_type": "internal"},
                {"to_url": "https://ext.com/x", "anchor_text": "x", "rel": "", "is_nofollow": False, "is_sponsored": False, "is_ugc": False, "link_type": "external"},
            ],
        ),
    )
    monkeypatch.setattr(pr_mod, "parse_seo", lambda *_a, **_k: ("desc", 4, "h1", 1, "https://site.com/canon"))
    monkeypatch.setattr(
        pr_mod,
        "parse_seo_extended",
        lambda *_a, **_k: {
            "viewport_present": True,
            "viewport_content": "w",
            "noindex": False,
            "has_schema": True,
            "heading_sequence": ["h1"],
            "images_without_alt": 0,
            "images_total": 1,
            "img_without_lazy": 0,
            "img_without_dimensions": 0,
            "aria_count": 0,
            "mixed_content_count": 0,
        },
    )
    monkeypatch.setattr(pr_mod, "parse_resources", lambda *_a, **_k: {"script_count": 1, "link_stylesheet_count": 1})
    monkeypatch.setattr(
        pr_mod,
        "parse_content_text",
        lambda *_a, **_k: {
            "word_count": 10,
            "reading_level": 4.2,
            "content_html_ratio": 30.0,
            "top_keywords": "[]",
            "content_excerpt": "abc",
        },
    )
    monkeypatch.setattr(
        pr_mod,
        "parse_social_meta",
        lambda *_a, **_k: {
            "og_title": "og",
            "og_description": "",
            "og_image": "",
            "og_type": "",
            "twitter_card": "",
            "twitter_title": "",
            "twitter_image": "",
        },
    )
    monkeypatch.setattr(pr_mod, "parse_tech_stack", lambda *_a, **_k: "[]")
    monkeypatch.setattr(pr_mod, "analyze_html", lambda *_a, **_k: {"ok": True})

    out = c.worker("https://site.com")
    assert out["status"] == 200
    assert out["title"] == "T"
    assert out["meta_description"] == "desc"
    assert out["word_count"] == 10
    assert "outlink_targets" in out
    assert "https://site.com/a" in json.loads(out["outlink_targets"])


def test_crawl_keeps_pending_futures_between_iterations(monkeypatch):
    import time
    import website_profiling.crawl.crawler as mod

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        concurrency=2,
        max_pages=2,
    )
    c.queue.put("https://site.com/slow")

    def _slow_worker(url):
        if url.endswith("/slow"):
            time.sleep(0.05)
        return {
            "url": url,
            "status": 200,
            "content_type": "text/html",
            "title": "ok",
            "outlinks": 0,
            "fetch_method": "static",
            "response_time_ms": "",
            "content_length": 0,
            "final_url": url,
            "meta_description": "",
            "meta_description_len": 0,
            "h1": "",
            "h1_count": 0,
            "canonical_url": "",
            "viewport_present": False,
            "viewport_content": "",
            "noindex": False,
            "has_schema": False,
            "heading_sequence": "",
            "images_without_alt": 0,
            "images_total": 0,
            "img_without_lazy": 0,
            "img_without_dimensions": 0,
            "aria_count": 0,
            "mixed_content_count": 0,
            "redirect_chain_length": 0,
            "cache_control": "",
            "etag": "",
            "x_robots_tag": "",
            "strict_transport_security": "",
            "x_content_type_options": "",
            "x_frame_options": "",
            "content_security_policy": "",
            "script_count": 0,
            "link_stylesheet_count": 0,
            "total_js_bytes": 0,
            "total_css_bytes": 0,
            "word_count": 0,
            "reading_level": 0.0,
            "content_html_ratio": 0.0,
            "top_keywords": "[]",
            "content_excerpt": "",
            "og_title": "",
            "og_description": "",
            "og_image": "",
            "og_type": "",
            "twitter_card": "",
            "twitter_title": "",
            "twitter_image": "",
            "tech_stack": "[]",
            "depth": None,
            "page_analysis": "{}",
        }

    monkeypatch.setattr(c, "worker", _slow_worker)
    df = c.crawl(show_progress=False)
    assert len(df) == 2


def test_crawl_waits_when_pool_saturated_instead_of_busy_spinning(monkeypatch):
    # Regression: when every worker slot is busy AND the frontier still has URLs,
    # the loop must block on wait() rather than busy-spin. We record the queue size
    # at each wait() call; on the buggy version wait() only fired once the queue was
    # empty (qsize == 0), so observing a wait() with a non-empty queue proves the fix.
    import time
    import website_profiling.crawl.crawler as mod

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        concurrency=2,
        max_pages=4,
    )
    for path in ("/a", "/b", "/c"):
        c.queue.put(f"https://site.com{path}")

    qsizes_at_wait: list[int] = []
    real_wait = mod.wait

    def _recording_wait(fs, **kwargs):
        qsizes_at_wait.append(c.queue.qsize())
        return real_wait(fs, **kwargs)

    monkeypatch.setattr(mod, "wait", _recording_wait)

    def _slow_worker(url):
        time.sleep(0.02)
        return {"url": url, "status": 200, "content_type": "text/html", "title": "ok", "outlinks": 0}

    monkeypatch.setattr(c, "worker", _slow_worker)
    df = c.crawl(show_progress=False)

    assert len(df) == 4
    assert any(q > 0 for q in qsizes_at_wait)


def test_crawl_runs_and_handles_done_futures(monkeypatch):
    import website_profiling.crawl.crawler as mod

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(start_url="https://site.com", ignore_robots=True, use_wappalyzer=False, concurrency=1, max_pages=1)
    monkeypatch.setattr(
        c,
        "worker",
        lambda url: {"url": url, "status": 200, "content_type": "text/html", "title": "ok", "outlinks": 0},
    )
    df = c.crawl(show_progress=False)
    assert not df.empty
    assert "crawl_time_s" in df.columns


def test_run_crawler_writes_csv(monkeypatch, tmp_path):
    import website_profiling.crawl.crawler as mod

    class FakeCrawler:
        def __init__(self, **_kwargs):
            pass

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200}])

    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    out_file = tmp_path / "out.csv"
    df, _ = mod.run_crawler("https://a.com", output_db=False, output_csv=str(out_file), show_progress=False)
    assert not df.empty
    assert out_file.exists()


def test_crawl_empty_results_builds_full_column_schema(monkeypatch):
    import website_profiling.crawl.crawler as mod

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        exclude_urls=["https://site.com"],
        store_outlinks=True,
    )
    df = c.crawl(show_progress=False)
    assert df.empty
    assert "fetch_method" in df.columns
    assert "outlink_targets" in df.columns
    assert "crawl_time_s" in df.columns


def test_crawl_skips_excluded_and_visited_urls(monkeypatch):
    import website_profiling.crawl.crawler as mod

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        concurrency=1,
        max_pages=2,
        exclude_urls=["https://site.com/skip"],
    )
    c.queue.put("https://site.com/skip")
    c.queue.put("https://site.com")
    c.visited.add("https://site.com")
    c.queue.put("https://site.com/second")

    calls: list[str] = []

    def _worker(url):
        calls.append(url)
        return {
            "url": url,
            "status": 200,
            "content_type": "text/html",
            "title": "ok",
            "outlinks": 0,
            "fetch_method": "static",
            "response_time_ms": "",
            "content_length": 0,
            "final_url": url,
            "meta_description": "",
            "meta_description_len": 0,
            "h1": "",
            "h1_count": 0,
            "canonical_url": "",
            "viewport_present": False,
            "viewport_content": "",
            "noindex": False,
            "has_schema": False,
            "heading_sequence": "",
            "images_without_alt": 0,
            "images_total": 0,
            "img_without_lazy": 0,
            "img_without_dimensions": 0,
            "aria_count": 0,
            "mixed_content_count": 0,
            "redirect_chain_length": 0,
            "cache_control": "",
            "etag": "",
            "x_robots_tag": "",
            "strict_transport_security": "",
            "x_content_type_options": "",
            "x_frame_options": "",
            "content_security_policy": "",
            "script_count": 0,
            "link_stylesheet_count": 0,
            "total_js_bytes": 0,
            "total_css_bytes": 0,
            "word_count": 0,
            "reading_level": 0.0,
            "content_html_ratio": 0.0,
            "top_keywords": "[]",
            "content_excerpt": "",
            "og_title": "",
            "og_description": "",
            "og_image": "",
            "og_type": "",
            "twitter_card": "",
            "twitter_title": "",
            "twitter_image": "",
            "tech_stack": "[]",
            "depth": None,
            "page_analysis": "{}",
        }

    monkeypatch.setattr(c, "worker", _worker)
    df = c.crawl(show_progress=False)
    assert calls == ["https://site.com/second"]
    assert len(df) == 1


def test_crawl_handles_worker_exception(monkeypatch):
    import website_profiling.crawl.crawler as mod

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        concurrency=1,
        max_pages=1,
        store_outlinks=True,
    )

    def _boom(_url):
        raise RuntimeError("worker exploded")

    monkeypatch.setattr(c, "worker", _boom)
    df = c.crawl(show_progress=False)
    assert len(df) == 1
    assert df.iloc[0]["status"] == "error"
    # The error row now carries the dequeued URL (so it persists to the DB in
    # streaming mode too), rather than being url-less and silently dropped.
    assert df.iloc[0]["url"] and "site.com" in str(df.iloc[0]["url"])
    assert "outlink_targets" in df.columns


def test_crawl_streams_rows_to_db_writer(monkeypatch):
    import website_profiling.crawl.crawler as mod

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )

    class FakeDbWriter:
        instances: list["FakeDbWriter"] = []

        def __init__(self, crawl_run_id: int, batch_size: int, *, store_page_html: bool = False) -> None:
            self.crawl_run_id = crawl_run_id
            self.batch_size = batch_size
            self.store_page_html = store_page_html
            self.enqueued: list[dict] = []
            self.started = False
            self.finished = False
            FakeDbWriter.instances.append(self)

        def start(self) -> None:
            self.started = True

        def enqueue(self, record: dict) -> None:
            self.enqueued.append(record)

        def finish(self) -> None:
            self.finished = True

        def join(self) -> None:
            return None

        def raise_if_failed(self) -> None:
            return None

    monkeypatch.setattr(mod, "_CrawlDbWriter", FakeDbWriter)
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        concurrency=1,
        max_pages=1,
    )
    monkeypatch.setattr(
        c,
        "worker",
        lambda url: {"url": url, "status": 200, "content_type": "", "title": "", "outlinks": 0},
    )
    c.crawl(show_progress=False, stream_crawl_run_id=42, stream_batch_size=100)
    writer = FakeDbWriter.instances[-1]
    assert writer.started is True
    assert writer.finished is True
    assert writer.enqueued and writer.enqueued[0]["url"] == "https://site.com"


def test_crawl_streams_error_rows_to_db_writer(monkeypatch):
    # Regression: an errored fetch must still be persisted to the DB in streaming
    # mode (it previously got a url-less error row and was silently dropped).
    import website_profiling.crawl.crawler as mod

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )

    enqueued: list[dict] = []

    class FakeDbWriter:
        def __init__(self, *_a, **_k) -> None:
            pass

        def start(self) -> None:
            pass

        def enqueue(self, record: dict) -> None:
            enqueued.append(record)

        def finish(self) -> None:
            pass

        def join(self) -> None:
            return None

        def raise_if_failed(self) -> None:
            return None

    monkeypatch.setattr(mod, "_CrawlDbWriter", FakeDbWriter)
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        concurrency=1,
        max_pages=1,
    )

    def _boom(_url):
        raise RuntimeError("worker exploded")

    monkeypatch.setattr(c, "worker", _boom)
    c.crawl(show_progress=False, stream_crawl_run_id=7, stream_batch_size=100)
    assert enqueued and enqueued[0]["status"] == "error"
    assert "site.com" in str(enqueued[0]["url"])


def test_run_crawler_writes_json(monkeypatch, tmp_path):
    import website_profiling.crawl.crawler as mod

    class FakeCrawler:
        def __init__(self, **_kwargs):
            pass

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200}])

    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    out_file = tmp_path / "out.json"
    mod.run_crawler("https://a.com", output_db=False, output_csv=str(out_file), show_progress=False)
    assert out_file.exists()


def test_run_crawler_non_streaming_db_write(monkeypatch):
    import website_profiling.crawl.crawler as mod

    class FakeCrawler:
        def __init__(self, **_kwargs):
            self.link_edges_accum = []

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200, "title": "ok"}])

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    writes: list[tuple] = []

    fake_db = types.SimpleNamespace(
        backup_db_if_exists=lambda: "/tmp/backup.sql",
        create_crawl_run=lambda *_a, **_k: 7,
        db_session=lambda: _Ctx(),
        read_historical_data=lambda: {"report_payload": [{"id": 1}]},
        restore_historical_data=lambda *_a, **_k: None,
        write_crawl=lambda conn, df, crawl_run_id=None: writes.append((conn, len(df), crawl_run_id)),
    )
    fake_storage = types.SimpleNamespace(ensure_crawl_tables_cleared=lambda *_a, **_k: None)
    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db", fake_db)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db.storage", fake_storage)

    df, _ = mod.run_crawler(
        "https://a.com",
        output_db=True,
        crawl_stream_to_db=False,
        max_pages=5,
        preserve_crawl_history=False,
        show_progress=False,
    )
    assert not df.empty
    assert writes and writes[0][2] == 7


def test_run_crawler_streaming_db_with_history_backup(monkeypatch):
    import website_profiling.crawl.crawler as mod

    class FakeCrawler:
        def __init__(self, **_kwargs):
            self.link_edges_accum = []

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200}])

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    cleared: list[bool] = []
    restored: list[bool] = []

    fake_db = types.SimpleNamespace(
        backup_db_if_exists=lambda: "/tmp/backup.sql",
        create_crawl_run=lambda *_a, **_k: 11,
        db_session=lambda: _Ctx(),
        read_historical_data=lambda: {"report_payload": [{"id": 1}]},
        restore_historical_data=lambda *_a, **_k: restored.append(True),
    )
    fake_storage = types.SimpleNamespace(
        ensure_crawl_tables_cleared=lambda *_a, **_k: cleared.append(True),
    )
    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db", fake_db)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db.storage", fake_storage)

    df, _ = mod.run_crawler(
        "https://a.com",
        output_db=True,
        crawl_stream_to_db=True,
        preserve_crawl_history=False,
        show_progress=False,
    )
    assert not df.empty
    assert cleared
    assert restored


def test_run_crawler_streaming_db_path(monkeypatch):
    import website_profiling.crawl.crawler as mod

    class FakeCrawler:
        def __init__(self, **_kwargs):
            self.link_edges_accum = []

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200}])

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    fake_db = types.SimpleNamespace(
        backup_db_if_exists=lambda: None,
        create_crawl_run=lambda *_a, **_k: 10,
        db_session=lambda: _Ctx(),
        read_historical_data=lambda: {},
        restore_historical_data=lambda *_a, **_k: None,
    )
    fake_storage = types.SimpleNamespace(ensure_crawl_tables_cleared=lambda *_a, **_k: None)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db", fake_db)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db.storage", fake_storage)

    df, _ = mod.run_crawler("https://a.com", output_db=True, crawl_stream_to_db=True, show_progress=False)
    assert not df.empty


def test_run_crawler_flushes_buffered_html(monkeypatch):
    import website_profiling.crawl.crawler as mod

    class FakeCrawler:
        def __init__(self, **_kwargs):
            self.link_edges_accum = []
            self.store_page_html = True
            self._html_buffer = [
                {"url": "https://a.com", "html": "<html></html>", "status": "200"},
            ]

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200}])

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    html_writes: list[tuple] = []

    fake_db = types.SimpleNamespace(
        backup_db_if_exists=lambda: None,
        create_crawl_run=lambda *_a, **_k: 7,
        db_session=lambda: _Ctx(),
        read_historical_data=lambda: {},
        restore_historical_data=lambda *_a, **_k: None,
        write_crawl=lambda *_a, **_k: None,
    )
    fake_storage = types.SimpleNamespace(ensure_crawl_tables_cleared=lambda *_a, **_k: None)
    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db", fake_db)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db.storage", fake_storage)
    monkeypatch.setattr(
        "website_profiling.db.html_store.write_page_html_batch",
        lambda _conn, rows, run_id, commit=True: html_writes.append((len(rows), run_id)),
    )

    mod.run_crawler(
        "https://a.com",
        output_db=True,
        preserve_crawl_history=False,
        show_progress=False,
        store_page_html=True,
    )
    assert html_writes == [(1, 7)]


def test_capture_page_html_enqueues_to_stream_writer():
    import website_profiling.crawl.crawler as mod

    class _Writer:
        def __init__(self):
            self.records: list[dict] = []

        def enqueue_html(self, record: dict) -> None:
            self.records.append(record)

    crawler = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        store_page_html=True,
        max_pages=1,
    )
    writer = _Writer()
    crawler._db_writer = writer
    crawler._capture_page_html(
        "https://site.com",
        "<html><body>Hello</body></html>",
        200,
        "text/html",
        "static",
    )
    assert len(writer.records) == 1
    assert writer.records[0]["url"] == "https://site.com"


def test_capture_page_pdf_enqueues_to_stream_writer():
    import website_profiling.crawl.crawler as mod

    class _Writer:
        def __init__(self):
            self.records: list[dict] = []

        def enqueue_html(self, record: dict) -> None:
            self.records.append(record)

    crawler = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        store_page_html=True,
        max_pages=1,
    )
    writer = _Writer()
    crawler._db_writer = writer
    crawler._capture_page_pdf(
        "https://site.com/report.pdf",
        "Extracted PDF text.",
        200,
        "application/pdf",
        "static",
    )
    assert len(writer.records) == 1
    assert writer.records[0]["url"] == "https://site.com/report.pdf"
    assert writer.records[0]["content_type"] == "application/pdf"


def test_run_crawler_compare_mobile_desktop_second_pass(monkeypatch):
    """compare_mobile_desktop=True triggers a second crawl and links the run IDs."""
    import website_profiling.crawl.crawler as mod

    crawl_calls: list[dict] = []

    class FakeCrawler:
        def __init__(self, **_kwargs):
            self.link_edges_accum = []
            self.store_page_html = False

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200, "title": "ok"}])

    run_id_seq = iter([7, 8])

    class _Ctx:
        def __init__(self):
            self._conn = object()

        def __enter__(self):
            return self._conn

        def __exit__(self, _t, _v, _tb):
            return False

    linked: list[tuple] = []
    fake_set_mobile = lambda conn, d, m: linked.append((d, m))

    def fake_get_latest(conn):
        return next(run_id_seq)

    fake_db = types.SimpleNamespace(
        backup_db_if_exists=lambda: None,
        create_crawl_run=lambda *_a, **_k: 7,
        db_session=lambda: _Ctx(),
        read_historical_data=lambda: {},
        restore_historical_data=lambda *_a, **_k: None,
        write_crawl=lambda conn, df, crawl_run_id=None: None,
    )
    fake_storage = types.SimpleNamespace(ensure_crawl_tables_cleared=lambda *_a, **_k: None)
    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db", fake_db)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db.storage", fake_storage)

    import website_profiling.db.crawl_store as cs_mod

    monkeypatch.setattr(cs_mod, "get_latest_crawl_run_id", fake_get_latest)
    monkeypatch.setattr(cs_mod, "set_mobile_run_id", fake_set_mobile)

    # Patch run_crawler itself for the recursive call to avoid double setup
    second_calls: list[dict] = []

    original_run = mod.run_crawler

    def patched_run(start_url="", **kwargs):
        if kwargs.get("compare_mobile_desktop") is False and kwargs.get("crawl_user_agent_preset") == "mobile":
            second_calls.append({"start_url": start_url, **kwargs})
            return pd.DataFrame([{"url": "https://a.com", "status": 200}]), 8
        return original_run(start_url, **kwargs)

    monkeypatch.setattr(mod, "run_crawler", patched_run)

    mod.run_crawler(
        "https://a.com",
        output_db=True,
        crawl_stream_to_db=False,
        max_pages=5,
        preserve_crawl_history=True,
        show_progress=False,
        compare_mobile_desktop=True,
    )

    assert len(second_calls) == 1
    assert second_calls[0]["crawl_user_agent_preset"] == "mobile"
    assert second_calls[0]["compare_mobile_desktop"] is False
    # set_mobile_run_id was called
    assert linked and linked[0][0] == 7

