"""Background thread: batch-insert crawl rows via PostgreSQL connection pool."""

from __future__ import annotations

import threading
from queue import Queue
from typing import Optional

import pandas as pd


class CrawlDbWriter(threading.Thread):
    """Background thread: batch-insert crawl rows via PostgreSQL connection pool."""

    def __init__(self, crawl_run_id: int, batch_size: int = 500) -> None:
        super().__init__(daemon=True)
        self.crawl_run_id = crawl_run_id
        self.batch_size = max(50, batch_size)
        self._queue: Queue = Queue()
        self._error: Optional[BaseException] = None

    def enqueue(self, record: dict) -> None:
        self._queue.put(record)

    def finish(self) -> None:
        self._queue.put(None)

    def run(self) -> None:
        from ..db import db_session
        from ..db.crawl_store import _crawl_rows_from_df, write_crawl_batch

        buffer: list[dict] = []
        try:
            while True:
                item = self._queue.get()
                if item is None:
                    if buffer:
                        chunk = pd.DataFrame(buffer)
                        with db_session() as conn:
                            rows = _crawl_rows_from_df(chunk, self.crawl_run_id)
                            write_crawl_batch(conn, rows, self.crawl_run_id, commit=True)
                    break
                buffer.append(item)
                if len(buffer) >= self.batch_size:
                    chunk = pd.DataFrame(buffer)
                    buffer = []
                    with db_session() as conn:
                        rows = _crawl_rows_from_df(chunk, self.crawl_run_id)
                        write_crawl_batch(conn, rows, self.crawl_run_id, commit=True)
        except BaseException as e:
            self._error = e

    def raise_if_failed(self) -> None:
        if self._error is not None:
            raise self._error


# Backward-compatible alias for tests and internal imports.
_CrawlDbWriter = CrawlDbWriter
