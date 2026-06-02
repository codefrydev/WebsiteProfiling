import pytest


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

