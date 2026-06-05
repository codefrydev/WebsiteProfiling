from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import MagicMock

import pytest


class _FakeResponse:
    status = 200
    headers = {
        "content-type": "text/html; charset=utf-8",
        "Cache-Control": "private",
        "ETag": '"abc"',
    }


class _FakePage:
    def __init__(self) -> None:
        self.url = "https://example.com/page"
        self._handlers: dict[str, list] = {}

    async def goto(self, _url: str, **_kwargs: Any) -> _FakeResponse:
        return _FakeResponse()

    async def content(self) -> str:
        return "<html><head><title>Rendered</title></head><body>ok</body></html>"

    async def route(self, _pattern: str, _handler: Any) -> None:
        return None

    async def close(self) -> None:
        return None

    def on(self, event: str, handler: Any) -> None:
        self._handlers.setdefault(event, []).append(handler)

    def remove_listener(self, event: str, handler: Any) -> None:
        if event in self._handlers:
            self._handlers[event] = [h for h in self._handlers[event] if h is not handler]


class _FakeContext:
    async def new_page(self) -> _FakePage:
        return _FakePage()

    async def close(self) -> None:
        return None


class _FakeBrowser:
    async def new_context(self, **_kwargs: Any) -> _FakeContext:
        return _FakeContext()

    async def close(self) -> None:
        return None


class _FakeChromium:
    async def launch(self, **_kwargs: Any) -> _FakeBrowser:
        return _FakeBrowser()


class _FakePlaywright:
    chromium = _FakeChromium()

    async def stop(self) -> None:
        return None


class _FakePlaywrightContext:
    async def start(self) -> _FakePlaywright:
        return _FakePlaywright()


def _install_fake_playwright(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_api = MagicMock()
    fake_api.async_playwright = lambda: _FakePlaywrightContext()
    monkeypatch.setitem(
        __import__("sys").modules,
        "playwright",
        MagicMock(async_api=fake_api),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "playwright.async_api",
        fake_api,
    )


@pytest.fixture
def fake_playwright(monkeypatch: pytest.MonkeyPatch):
    _install_fake_playwright(monkeypatch)
    yield


def test_browser_fetcher_fetch_returns_rendered_html(fake_playwright):
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fetcher = BrowserFetcher(
        timeout=5,
        js_concurrency=1,
        extra_wait_ms=0,
        block_resources=False,
        capture_console=False,
        capture_failed_requests=False,
    )
    try:
        result = fetcher.fetch("https://example.com/")
        assert result.status == 200
        assert result.fetch_method == "rendered"
        assert result.text is not None
        assert "Rendered" in result.text
        assert result.response_time_ms is not None
        assert result.headers_dict.get("Cache-Control") == "private"
    finally:
        fetcher.close()


def test_browser_fetcher_closed_fetch_returns_error(fake_playwright):
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=False)
    fetcher.close()
    result = fetcher.fetch("https://example.com/")
    assert result.status is None
    assert result.fetch_method == "rendered"


def test_browser_fetcher_captures_console_with_diagnostics(fake_playwright):
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fetcher = BrowserFetcher(
        timeout=5,
        js_concurrency=1,
        extra_wait_ms=0,
        block_resources=True,
        capture_console=True,
        console_levels=frozenset({"error"}),
    )
    try:
        result = fetcher.fetch("https://example.com/")
        assert result.status == 200
        assert result.browser_diagnostics is not None
        assert "summary" in result.browser_diagnostics
    finally:
        fetcher.close()


def test_hybrid_fetch_uses_browser_when_spa_detected(monkeypatch):
    from website_profiling.crawl.fetchers.base import FetchResult
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    static_html = '<html><body><div id="root"></div></body></html>'
    rendered = FetchResult(
        status=200,
        content_type="text/html",
        text="<html><body>rendered</body></html>",
        response_time_ms=10,
        content_length=30,
        final_url="https://example.com/",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="rendered",
    )

    class FakeStatic:
        def fetch(self, _url):
            return FetchResult(
                status=200,
                content_type="text/html",
                text=static_html,
                response_time_ms=1,
                content_length=len(static_html),
                final_url="https://example.com/",
                headers_dict={},
                redirect_chain_length=0,
                fetch_method="static",
            )

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            return rendered

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = hybrid.fetch("https://example.com/")
        assert out.fetch_method == "rendered"
        assert "rendered" in (out.text or "")
    finally:
        hybrid.close()


def test_build_fetcher_javascript_mode(monkeypatch):
    from website_profiling.crawl.fetchers.browser import BrowserFetcher
    from website_profiling.crawl.fetchers.factory import build_fetcher

    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.factory.validate_browser_available",
        lambda: None,
    )
    _install_fake_playwright(monkeypatch)

    fetcher = build_fetcher(render_mode="javascript", js_timeout=5, js_concurrency=1, js_extra_wait_ms=0)
    try:
        assert isinstance(fetcher, BrowserFetcher)
    finally:
        fetcher.close()


def test_build_fetcher_auto_mode(monkeypatch):
    from website_profiling.crawl.fetchers.factory import build_fetcher
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.factory.validate_browser_available",
        lambda: None,
    )

    fetcher = build_fetcher(render_mode="auto", timeout=5)
    try:
        assert isinstance(fetcher, HybridFetcher)
    finally:
        fetcher.close()


def test_merge_browser_into_page_analysis_invalid_json():
    from website_profiling.crawl.fetchers.browser_diagnostics import merge_browser_into_page_analysis

    diag = {"summary": {"console_error_count": 1}}
    out = merge_browser_into_page_analysis("not-json", diag)
    import json

    parsed = json.loads(out)
    assert parsed["browser"]["summary"]["console_error_count"] == 1


def test_browser_summary_from_page_analysis():
    from website_profiling.crawl.fetchers.browser_diagnostics import browser_summary_from_page_analysis

    summary = browser_summary_from_page_analysis(
        {"browser": {"summary": {"console_error_count": 2, "page_error_count": 1}}}
    )
    assert summary["console_error_count"] == 2
    assert summary["page_error_count"] == 1


def test_parse_console_levels_defaults():
    from website_profiling.crawl.fetchers.browser_diagnostics import parse_console_levels

    assert parse_console_levels("") == frozenset({"error", "warning"})
    assert parse_console_levels("info, error") == frozenset({"info", "error"})


def test_truncate_diag_text():
    from website_profiling.crawl.fetchers.browser_diagnostics import truncate_diag_text

    assert truncate_diag_text("short") == "short"
    long = "x" * 600
    assert truncate_diag_text(long).endswith("...")
    assert len(truncate_diag_text(long)) == 500
