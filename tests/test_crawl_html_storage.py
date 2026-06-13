"""Tests for HTML capture during crawl."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from website_profiling.crawl.html_capture import build_page_html_record, should_store_page_html


def test_should_store_page_html_accepts_200_html() -> None:
    assert should_store_page_html(
        enabled=True,
        status=200,
        content_type="text/html; charset=utf-8",
        html="<html><body>ok</body></html>",
        max_bytes=10_000,
    )


def test_should_store_page_html_rejects_when_disabled() -> None:
    assert not should_store_page_html(
        enabled=False,
        status=200,
        content_type="text/html",
        html="<html></html>",
        max_bytes=10_000,
    )


def test_should_store_page_html_rejects_404() -> None:
    assert not should_store_page_html(
        enabled=True,
        status=404,
        content_type="text/html",
        html="<html></html>",
        max_bytes=10_000,
    )


def test_should_store_page_html_rejects_non_html_mime() -> None:
    assert not should_store_page_html(
        enabled=True,
        status=200,
        content_type="application/json",
        html='{"a":1}',
        max_bytes=10_000,
    )


def test_should_store_page_html_rejects_oversized() -> None:
    html = "x" * 100
    assert not should_store_page_html(
        enabled=True,
        status=200,
        content_type="text/html",
        html=html,
        max_bytes=50,
    )


def test_build_page_html_record_normalizes_url() -> None:
    rec = build_page_html_record(
        url="https://example.com/page/",
        html="<html>hi</html>",
        status=200,
        content_type="text/html",
        fetch_method="rendered",
        max_bytes=5000,
    )
    assert rec is not None
    assert rec["url"] == "https://example.com/page"
    assert rec["fetch_method"] == "rendered"
    assert rec["byte_length"] == len("<html>hi</html>".encode("utf-8"))


def test_crawler_capture_uses_buffer_when_no_db_writer(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.crawler import Crawler

    monkeypatch.setattr(
        "website_profiling.crawl.crawler.build_fetcher",
        lambda **kwargs: MagicMock(fetch=MagicMock()),
    )
    monkeypatch.setattr(
        "website_profiling.crawl.frontier.CrawlFrontier.seed_initial_urls",
        lambda *args, **kwargs: None,
    )

    crawler = Crawler(
        start_url="https://example.com",
        max_pages=1,
        store_page_html=True,
        max_stored_html_bytes=50_000,
    )
    crawler._capture_page_html(
        "https://example.com/a",
        "<html><body>text</body></html>",
        200,
        "text/html",
        "static",
    )
    assert len(crawler._html_buffer) == 1
    assert crawler._html_buffer[0]["url"] == "https://example.com/a"


def test_crawler_skips_html_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.crawler import Crawler

    monkeypatch.setattr(
        "website_profiling.crawl.crawler.build_fetcher",
        lambda **kwargs: MagicMock(fetch=MagicMock()),
    )
    monkeypatch.setattr(
        "website_profiling.crawl.frontier.CrawlFrontier.seed_initial_urls",
        lambda *args, **kwargs: None,
    )

    crawler = Crawler(start_url="https://example.com", max_pages=1, store_page_html=False)
    crawler._capture_page_html(
        "https://example.com/a",
        "<html><body>text</body></html>",
        200,
        "text/html",
        "static",
    )
    assert crawler._html_buffer == []
