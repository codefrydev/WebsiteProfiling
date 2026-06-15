"""Background thread: batch-insert crawl rows and optional HTML via PostgreSQL connection pool."""

from __future__ import annotations

import threading
from queue import Queue
from typing import Optional

import pandas as pd


class CrawlDbWriter(threading.Thread):
    """Background thread: batch-insert crawl rows and optional page HTML."""

    def __init__(self, crawl_run_id: int, batch_size: int = 500, *, store_page_html: bool = False) -> None:
        super().__init__(daemon=True)
        self.crawl_run_id = crawl_run_id
        self.batch_size = max(50, batch_size)
        self.store_page_html = bool(store_page_html)
        self._queue: Queue = Queue()
        self._error: Optional[BaseException] = None

    def enqueue(self, record: dict) -> None:
        if self._error is not None:
            return
        self._queue.put(("crawl", record))

    def enqueue_html(self, record: dict) -> None:
        if not self.store_page_html or self._error is not None:
            return
        self._queue.put(("html", record))

    def finish(self) -> None:
        self._queue.put(None)

    def _flush_crawl(self, buffer: list[dict]) -> None:
        if not buffer:
            return
        from ..db import db_session
        from ..db.crawl_store import _crawl_rows_from_df, write_crawl_batch

        chunk = pd.DataFrame(buffer)
        with db_session() as conn:
            rows = _crawl_rows_from_df(chunk, self.crawl_run_id)
            write_crawl_batch(conn, rows, self.crawl_run_id, commit=True)

    def _flush_html(self, buffer: list[dict]) -> None:
        if not buffer:
            return
        from ..db import db_session
        from ..db.html_store import write_page_html_batch

        with db_session() as conn:
            write_page_html_batch(conn, buffer, self.crawl_run_id, commit=True)

    def run(self) -> None:
        crawl_buffer: list[dict] = []
        html_buffer: list[dict] = []
        try:
            while True:
                item = self._queue.get()
                if item is None:
                    self._flush_crawl(crawl_buffer)
                    self._flush_html(html_buffer)
                    break
                kind, payload = item
                if kind == "html":
                    html_buffer.append(payload)
                    if len(html_buffer) >= self.batch_size:
                        self._flush_html(html_buffer)
                        html_buffer = []
                else:
                    crawl_buffer.append(payload)
                    if len(crawl_buffer) >= self.batch_size:
                        self._flush_crawl(crawl_buffer)
                        crawl_buffer = []
        except BaseException as e:
            self._error = e

    def raise_if_failed(self) -> None:
        if self._error is not None:
            raise self._error


# Backward-compatible alias for tests and internal imports.
_CrawlDbWriter = CrawlDbWriter
