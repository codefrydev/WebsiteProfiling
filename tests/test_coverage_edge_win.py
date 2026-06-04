from __future__ import annotations

import pytest


def test_pool_get_database_url_raises_when_missing(monkeypatch):
    from website_profiling.db.pool import get_database_url

    monkeypatch.delenv("DATABASE_URL", raising=False)
    with pytest.raises(RuntimeError):
        get_database_url()


def test_report_store_fallback_links_and_exception_path(monkeypatch):
    from website_profiling.db import report_store

    monkeypatch.setattr(report_store, "get_crawl_run_info", lambda _c, _rid: None)
    domain = report_store._canonical_domain_from_report(object(), {"links": [{"url": "https://fallback.com/p"}]})  # type: ignore[arg-type]
    assert domain == "fallback.com"

    class BoomConn:
        def execute(self, *_a, **_k):
            raise RuntimeError("x")

    assert report_store.read_report_payload(BoomConn()) is None  # type: ignore[arg-type]

