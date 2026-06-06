import os
import types

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

