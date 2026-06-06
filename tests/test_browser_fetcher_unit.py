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


def test_browser_fetcher_fetch_applies_extra_wait(fake_playwright):
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    sleeps: list[float] = []

    async def _sleep(seconds: float) -> None:
        sleeps.append(seconds)

    import website_profiling.crawl.fetchers.browser as browser_mod

    original_sleep = browser_mod.asyncio.sleep
    browser_mod.asyncio.sleep = _sleep
    try:
        fetcher = BrowserFetcher(
            timeout=5,
            js_concurrency=1,
            extra_wait_ms=100,
            block_resources=False,
            capture_console=False,
            capture_failed_requests=False,
        )
        try:
            result = fetcher.fetch("https://example.com/")
            assert result.status == 200
            assert sleeps == [0.1]
        finally:
            fetcher.close()
    finally:
        browser_mod.asyncio.sleep = original_sleep


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


def test_page_diagnostics_collector_handlers_and_detach() -> None:
    from website_profiling.crawl.fetchers.browser import _PageDiagnosticsCollector

    collector = _PageDiagnosticsCollector(
        capture_console=True,
        console_levels=frozenset({"error"}),
        capture_failed_requests=True,
        max_per_page=3,
    )

    class _FakePage:
        def __init__(self) -> None:
            self.handlers: dict[str, Any] = {}

        def on(self, event: str, handler: Any) -> None:
            self.handlers[event] = handler

        def remove_listener(self, event: str, handler: Any) -> None:
            raise RuntimeError("listener missing")

    page = _FakePage()
    collector.attach(page)

    class _ConsoleMsg:
        type = "error"
        text = "console boom"
        location = {"url": "https://example.com/app.js", "lineNumber": 7}

    page.handlers["console"](_ConsoleMsg())
    assert collector.console[0]["source_url"] == "https://example.com/app.js"
    assert collector.console[0]["line"] == 7

    class _InfoMsg:
        type = "info"
        text = "ignored"
        location = None

    page.handlers["console"](_InfoMsg())
    assert len(collector.console) == 1

    page.handlers["console"](_ConsoleMsg())
    page.handlers["console"](_ConsoleMsg())
    assert len(collector.console) == 3
    page.handlers["console"](_ConsoleMsg())
    assert len(collector.console) == 3

    class _PageErr:
        def __str__(self) -> str:
            return "page err"

        stack = "stack trace"

    page.handlers["pageerror"](_PageErr())
    page.handlers["pageerror"](_PageErr())
    page.handlers["pageerror"](_PageErr())
    page.handlers["pageerror"](_PageErr())
    assert len(collector.page_errors) == 3

    class _ReqStr:
        url = "https://example.com/a"
        method = "GET"
        failure = "net::ERR_FAILED"

    class _ReqObj:
        url = "https://example.com/b"
        method = "POST"

        class failure:
            error_text = "timeout"

    class _ReqNone:
        url = "https://example.com/c"
        method = "HEAD"
        failure = None

    page.handlers["requestfailed"](_ReqStr())
    page.handlers["requestfailed"](_ReqObj())
    page.handlers["requestfailed"](_ReqNone())
    page.handlers["requestfailed"](_ReqStr())
    assert len(collector.failed_requests) == 3
    assert collector.failed_requests[0]["failure"] == "net::ERR_FAILED"
    assert collector.failed_requests[1]["failure"] == "timeout"
    assert collector.failed_requests[2]["failure"] == ""

    collector.detach(page)


def test_browser_fetcher_startup_timeout(monkeypatch: pytest.MonkeyPatch, fake_playwright) -> None:
    import threading

    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    _orig_wait = threading.Event.wait

    def _wait_false_on_ready(self, timeout=None):
        if timeout == 60:
            return False
        return _orig_wait(self, timeout=timeout)

    monkeypatch.setattr(threading.Event, "wait", _wait_false_on_ready)

    with pytest.raises(RuntimeError, match="60 seconds"):
        BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=False)


def test_browser_fetcher_startup_error(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    class _FailPlaywrightContext:
        async def start(self) -> None:
            raise RuntimeError("playwright init failed")

    fake_api = MagicMock()
    fake_api.async_playwright = lambda: _FailPlaywrightContext()
    monkeypatch.setitem(__import__("sys").modules, "playwright", MagicMock(async_api=fake_api))
    monkeypatch.setitem(__import__("sys").modules, "playwright.async_api", fake_api)

    with pytest.raises(RuntimeError, match="JavaScript crawl requires"):
        BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=False)


def test_browser_fetcher_uses_chrome_path(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    launch_kwargs: dict[str, Any] = {}

    class _CapturingChromium:
        async def launch(self, **kwargs: Any) -> _FakeBrowser:
            launch_kwargs.update(kwargs)
            return _FakeBrowser()

    class _CapturingPlaywright:
        chromium = _CapturingChromium()

        async def stop(self) -> None:
            return None

    class _CapturingPlaywrightContext:
        async def start(self) -> _CapturingPlaywright:
            return _CapturingPlaywright()

    fake_api = MagicMock()
    fake_api.async_playwright = lambda: _CapturingPlaywrightContext()
    monkeypatch.setitem(__import__("sys").modules, "playwright", MagicMock(async_api=fake_api))
    monkeypatch.setitem(__import__("sys").modules, "playwright.async_api", fake_api)
    monkeypatch.setenv("CHROME_PATH", "/opt/chrome/chrome")

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=False)
    try:
        assert launch_kwargs.get("executable_path") == "/opt/chrome/chrome"
    finally:
        fetcher.close()


class _RouteTestingPage(_FakePage):
    async def route(self, _pattern: str, handler: Any) -> None:
        class _FakeRoute:
            def __init__(self) -> None:
                self.aborted = False
                self.continued = False

            async def abort(self) -> None:
                self.aborted = True

            async def continue_(self) -> None:
                self.continued = True

        for resource_type in ("image", "document"):
            route = _FakeRoute()

            class _FakeReq:
                pass

            _FakeReq.resource_type = resource_type
            await handler(route, _FakeReq())
            if resource_type == "image":
                assert route.aborted
            else:
                assert route.continued


class _RouteTestingContext(_FakeContext):
    async def new_page(self) -> _RouteTestingPage:
        return _RouteTestingPage()


class _RouteTestingBrowser(_FakeBrowser):
    async def new_context(self, **_kwargs: Any) -> _RouteTestingContext:
        return _RouteTestingContext()


class _RouteTestingChromium:
    async def launch(self, **_kwargs: Any) -> _RouteTestingBrowser:
        return _RouteTestingBrowser()


class _RouteTestingPlaywright:
    chromium = _RouteTestingChromium()

    async def stop(self) -> None:
        return None


class _RouteTestingPlaywrightContext:
    async def start(self) -> _RouteTestingPlaywright:
        return _RouteTestingPlaywright()


def test_browser_fetcher_block_resources_route_handler(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fake_api = MagicMock()
    fake_api.async_playwright = lambda: _RouteTestingPlaywrightContext()
    monkeypatch.setitem(__import__("sys").modules, "playwright", MagicMock(async_api=fake_api))
    monkeypatch.setitem(__import__("sys").modules, "playwright.async_api", fake_api)

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=True)
    try:
        result = fetcher.fetch("https://example.com/")
        assert result.status == 200
    finally:
        fetcher.close()


class _WorkerErrorPage(_FakePage):
    def __init__(self) -> None:
        self._handlers: dict[str, list] = {}

    async def goto(self, _url: str, **_kwargs: Any) -> _FakeResponse:
        return _FakeResponse()

    @property
    def url(self) -> str:
        raise RuntimeError("url access failed in worker")


class _WorkerErrorContext(_FakeContext):
    async def new_page(self) -> _WorkerErrorPage:
        return _WorkerErrorPage()


class _WorkerErrorBrowser(_FakeBrowser):
    async def new_context(self, **_kwargs: Any) -> _WorkerErrorContext:
        return _WorkerErrorContext()


class _WorkerErrorChromium:
    async def launch(self, **_kwargs: Any) -> _WorkerErrorBrowser:
        return _WorkerErrorBrowser()


class _WorkerErrorPlaywright:
    chromium = _WorkerErrorChromium()

    async def stop(self) -> None:
        return None


class _WorkerErrorPlaywrightContext:
    async def start(self) -> _WorkerErrorPlaywright:
        return _WorkerErrorPlaywright()


def test_browser_fetcher_worker_exception_returns_empty_result(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fake_api = MagicMock()
    fake_api.async_playwright = lambda: _WorkerErrorPlaywrightContext()
    monkeypatch.setitem(__import__("sys").modules, "playwright", MagicMock(async_api=fake_api))
    monkeypatch.setitem(__import__("sys").modules, "playwright.async_api", fake_api)

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=False)
    try:
        result = fetcher.fetch("https://example.com/boom")
        assert result.status is None
        assert result.final_url == "https://example.com/boom"
    finally:
        fetcher.close()


class _CloseFailPage(_FakePage):
    async def close(self) -> None:
        raise RuntimeError("page close failed")


class _CloseFailContext(_FakeContext):
    async def new_page(self) -> _CloseFailPage:
        return _CloseFailPage()

    async def close(self) -> None:
        raise RuntimeError("context close failed")


class _CloseFailBrowser(_FakeBrowser):
    async def new_context(self, **_kwargs: Any) -> _CloseFailContext:
        return _CloseFailContext()

    async def close(self) -> None:
        raise RuntimeError("browser close failed")


class _CloseFailChromium:
    async def launch(self, **_kwargs: Any) -> _CloseFailBrowser:
        return _CloseFailBrowser()


class _CloseFailPlaywright:
    chromium = _CloseFailChromium()

    async def stop(self) -> None:
        raise RuntimeError("playwright stop failed")


class _CloseFailPlaywrightContext:
    async def start(self) -> _CloseFailPlaywright:
        return _CloseFailPlaywright()


def test_browser_fetcher_close_swallows_cleanup_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fake_api = MagicMock()
    fake_api.async_playwright = lambda: _CloseFailPlaywrightContext()
    monkeypatch.setitem(__import__("sys").modules, "playwright", MagicMock(async_api=fake_api))
    monkeypatch.setitem(__import__("sys").modules, "playwright.async_api", fake_api)

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=False)
    fetcher.close()
    fetcher.close()


class _GotoFailPage(_FakePage):
    async def goto(self, _url: str, **_kwargs: Any) -> None:
        raise RuntimeError("navigation failed")


class _GotoFailContext(_FakeContext):
    async def new_page(self) -> _GotoFailPage:
        return _GotoFailPage()


class _GotoFailBrowser(_FakeBrowser):
    async def new_context(self, **_kwargs: Any) -> _GotoFailContext:
        return _GotoFailContext()


class _GotoFailChromium:
    async def launch(self, **_kwargs: Any) -> _GotoFailBrowser:
        return _GotoFailBrowser()


class _GotoFailPlaywright:
    chromium = _GotoFailChromium()

    async def stop(self) -> None:
        return None


class _GotoFailPlaywrightContext:
    async def start(self) -> _GotoFailPlaywright:
        return _GotoFailPlaywright()


def test_browser_fetcher_goto_exception_returns_none_status(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fake_api = MagicMock()
    fake_api.async_playwright = lambda: _GotoFailPlaywrightContext()
    monkeypatch.setitem(__import__("sys").modules, "playwright", MagicMock(async_api=fake_api))
    monkeypatch.setitem(__import__("sys").modules, "playwright.async_api", fake_api)

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=50, block_resources=False)
    try:
        result = fetcher.fetch("https://example.com/missing")
        assert result.status is None
        assert result.content_length == 0
    finally:
        fetcher.close()


class _NullResponsePage(_FakePage):
    async def goto(self, _url: str, **_kwargs: Any) -> None:
        return None


class _NullResponseContext(_FakeContext):
    async def new_page(self) -> _NullResponsePage:
        return _NullResponsePage()


class _NullResponseBrowser(_FakeBrowser):
    async def new_context(self, **_kwargs: Any) -> _NullResponseContext:
        return _NullResponseContext()


class _NullResponseChromium:
    async def launch(self, **_kwargs: Any) -> _NullResponseBrowser:
        return _NullResponseBrowser()


class _NullResponsePlaywright:
    chromium = _NullResponseChromium()

    async def stop(self) -> None:
        return None


class _NullResponsePlaywrightContext:
    async def start(self) -> _NullResponsePlaywright:
        return _NullResponsePlaywright()


def test_browser_fetcher_null_response_skips_extra_wait(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fake_api = MagicMock()
    fake_api.async_playwright = lambda: _NullResponsePlaywrightContext()
    monkeypatch.setitem(__import__("sys").modules, "playwright", MagicMock(async_api=fake_api))
    monkeypatch.setitem(__import__("sys").modules, "playwright.async_api", fake_api)

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=500, block_resources=False)
    try:
        result = fetcher.fetch("https://example.com/null")
        assert result.status is None
    finally:
        fetcher.close()


class _ContentFailPage(_FakePage):
    async def content(self) -> str:
        raise RuntimeError("content extraction failed")


class _ContentFailContext(_FakeContext):
    async def new_page(self) -> _ContentFailPage:
        return _ContentFailPage()


class _ContentFailBrowser(_FakeBrowser):
    async def new_context(self, **_kwargs: Any) -> _ContentFailContext:
        return _ContentFailContext()


class _ContentFailChromium:
    async def launch(self, **_kwargs: Any) -> _ContentFailBrowser:
        return _ContentFailBrowser()


class _ContentFailPlaywright:
    chromium = _ContentFailChromium()

    async def stop(self) -> None:
        return None


class _ContentFailPlaywrightContext:
    async def start(self) -> _ContentFailPlaywright:
        return _ContentFailPlaywright()


def test_browser_fetcher_content_exception_returns_none_text(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fake_api = MagicMock()
    fake_api.async_playwright = lambda: _ContentFailPlaywrightContext()
    monkeypatch.setitem(__import__("sys").modules, "playwright", MagicMock(async_api=fake_api))
    monkeypatch.setitem(__import__("sys").modules, "playwright.async_api", fake_api)

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=False)
    try:
        result = fetcher.fetch("https://example.com/")
        assert result.status == 200
        assert result.text is None
    finally:
        fetcher.close()


def test_browser_fetcher_fetch_timeout_returns_empty_result(
    monkeypatch: pytest.MonkeyPatch, fake_playwright
) -> None:
    import concurrent.futures

    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    real_result = concurrent.futures.Future.result

    def _timeout_on_fetch(self, timeout=None):
        if timeout is not None:
            raise concurrent.futures.TimeoutError()
        return real_result(self, timeout=timeout)

    monkeypatch.setattr(concurrent.futures.Future, "result", _timeout_on_fetch)

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=False)
    try:
        result = fetcher.fetch("https://example.com/slow")
        assert result.status is None
        assert result.final_url == "https://example.com/slow"
    finally:
        fetcher.close()


def test_run_loop_thread_records_startup_error_and_cancels_tasks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio
    import threading

    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    cancelled: list[bool] = []

    class _FakeTask:
        def cancel(self) -> None:
            cancelled.append(True)

    async def _boom_main(self) -> None:
        raise RuntimeError("async main failed")

    async def _gather_fail(*_tasks, return_exceptions=False):
        raise RuntimeError("gather failed")

    monkeypatch.setattr(BrowserFetcher, "_async_main", _boom_main)
    monkeypatch.setattr(asyncio, "all_tasks", lambda _loop: [_FakeTask()])
    monkeypatch.setattr(asyncio, "gather", _gather_fail)

    fetcher = BrowserFetcher.__new__(BrowserFetcher)
    fetcher._ready = threading.Event()
    fetcher._startup_error = None
    fetcher._loop = None
    fetcher._thread = None
    fetcher._closed = False
    fetcher._jobs = None

    fetcher._run_loop_thread()

    assert fetcher._startup_error is not None
    assert cancelled


def test_browser_fetcher_close_when_loop_unavailable(fake_playwright) -> None:
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    fetcher = BrowserFetcher(timeout=5, js_concurrency=1, extra_wait_ms=0, block_resources=False)
    fetcher._loop = None
    fetcher._closed = False
    fetcher.close()
