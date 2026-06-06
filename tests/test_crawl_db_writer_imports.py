import pytest


def test_crawl_db_writer_enqueue_and_batch_flush(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.crawler import _CrawlDbWriter

    written: list[tuple[int, int, bool]] = []

    class _FakeConn:
        pass

    class _FakeCtx:
        def __enter__(self):
            return _FakeConn()

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr("website_profiling.db.db_session", lambda: _FakeCtx())
    monkeypatch.setattr(
        "website_profiling.db.crawl_store._crawl_rows_from_df",
        lambda df, run_id: [{"url": row["url"], "run_id": run_id} for row in df.to_dict("records")],
    )
    monkeypatch.setattr(
        "website_profiling.db.crawl_store.write_crawl_batch",
        lambda _conn, rows, run_id, commit=True: written.append((len(rows), run_id, commit)),
    )

    writer = _CrawlDbWriter(crawl_run_id=5, batch_size=50)
    for i in range(51):
        writer.enqueue({"url": f"https://a.com/{i}"})
    writer.finish()
    writer.run()
    writer.raise_if_failed()

    assert written == [(50, 5, True), (1, 5, True)]


def test_crawl_db_writer_records_run_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.crawler import _CrawlDbWriter

    class _BrokenCtx:
        def __enter__(self):
            raise RuntimeError("db unavailable")

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr("website_profiling.db.db_session", lambda: _BrokenCtx())

    writer = _CrawlDbWriter(crawl_run_id=1, batch_size=50)
    writer.enqueue({"url": "https://a.com"})
    writer.finish()
    writer.run()

    with pytest.raises(RuntimeError, match="db unavailable"):
        writer.raise_if_failed()


def test_crawl_db_writer_run_does_not_import_error() -> None:
    """
    Regression: during the db/ split, _CrawlDbWriter.run() imported helpers from
    website_profiling.db.storage, which no longer exported them. That only fails
    at runtime (thread start), so we exercise .run() directly with an empty queue.
    """
    from website_profiling.crawl.crawler import _CrawlDbWriter

    writer = _CrawlDbWriter(crawl_run_id=1, batch_size=50)
    writer.finish()  # enqueue sentinel so run() exits without touching DB

    # If imports are wrong, this raises ImportError immediately.
    writer.run()

