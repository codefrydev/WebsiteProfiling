"""Headless browser fetcher: async Playwright on a dedicated event-loop thread."""

from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from concurrent.futures import Future
from dataclasses import dataclass
from typing import Any, Callable, Optional

from .base import HEADER_KEYS, FetchResult
from .browser_diagnostics import finalize_browser_diagnostics, truncate_diag_text

logger = logging.getLogger(__name__)

_BROWSER_INSTALL_MSG = (
    "JavaScript crawl requires Playwright and Chromium. Install: "
    "pip install -r requirements.txt. "
    "Chrome or Chromium must be available (set CHROME_PATH if needed)."
)

_DEFAULT_CHROME_ARGS = [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--headless=new",
]

_BLOCKED_RESOURCE_TYPES = frozenset({"image", "media", "font"})


@dataclass
class _FetchJob:
    url: str
    future: Future[FetchResult]


class _PageDiagnosticsCollector:
    def __init__(
        self,
        *,
        capture_console: bool,
        console_levels: frozenset[str],
        capture_failed_requests: bool,
        max_per_page: int,
    ) -> None:
        self.capture_console = capture_console
        self.console_levels = console_levels
        self.capture_failed_requests = capture_failed_requests
        self.max_per_page = max(1, int(max_per_page))
        self.console: list[dict[str, Any]] = []
        self.page_errors: list[dict[str, Any]] = []
        self.failed_requests: list[dict[str, Any]] = []
        self._handlers: list[tuple[str, Callable[..., Any]]] = []

    def attach(self, page: Any) -> None:
        if self.capture_console:

            def on_console(msg: Any) -> None:
                level = str(getattr(msg, "type", "") or "").lower()
                if level not in self.console_levels or len(self.console) >= self.max_per_page:
                    return
                entry: dict[str, Any] = {
                    "level": level,
                    "text": truncate_diag_text(getattr(msg, "text", "")),
                }
                loc = getattr(msg, "location", None)
                if isinstance(loc, dict):
                    if loc.get("url"):
                        entry["source_url"] = str(loc["url"])
                    if loc.get("lineNumber") is not None:
                        entry["line"] = int(loc["lineNumber"])
                self.console.append(entry)

            page.on("console", on_console)
            self._handlers.append(("console", on_console))

            def on_page_error(err: Any) -> None:
                if len(self.page_errors) >= self.max_per_page:
                    return
                self.page_errors.append(
                    {
                        "message": truncate_diag_text(str(err)),
                        "stack": truncate_diag_text(getattr(err, "stack", "") or ""),
                    }
                )

            page.on("pageerror", on_page_error)
            self._handlers.append(("pageerror", on_page_error))

        if self.capture_failed_requests:

            def on_request_failed(request: Any) -> None:
                if len(self.failed_requests) >= self.max_per_page:
                    return
                failure = getattr(request, "failure", None)
                if isinstance(failure, str):
                    fail_text = failure
                elif failure is not None:
                    fail_text = getattr(failure, "error_text", None) or str(failure)
                else:
                    fail_text = ""
                self.failed_requests.append(
                    {
                        "url": str(getattr(request, "url", "") or ""),
                        "method": str(getattr(request, "method", "") or ""),
                        "failure": truncate_diag_text(fail_text),
                    }
                )

            page.on("requestfailed", on_request_failed)
            self._handlers.append(("requestfailed", on_request_failed))

    def detach(self, page: Any) -> None:
        for event, handler in self._handlers:
            try:
                page.remove_listener(event, handler)
            except Exception:
                pass
        self._handlers.clear()

    def build(self) -> dict[str, Any]:
        return finalize_browser_diagnostics(self.console, self.page_errors, self.failed_requests)


class BrowserFetcher:
    """Sync API bridging crawler threads to async Playwright page pool."""

    def __init__(
        self,
        *,
        timeout: int = 30,
        user_agent: str = "WebsiteProfilingCrawler/1.0",
        js_concurrency: int = 3,
        wait_until: str = "domcontentloaded",
        extra_wait_ms: int = 1500,
        block_resources: bool = True,
        capture_console: bool = True,
        console_levels: frozenset[str] | None = None,
        capture_failed_requests: bool = False,
        console_max_per_page: int = 20,
        run_axe: bool = False,
        extra_http_headers: Optional[dict[str, str]] = None,
        http_credentials: Optional[dict[str, str]] = None,
    ) -> None:
        self.timeout = max(1, int(timeout))
        self.user_agent = user_agent
        self.extra_http_headers = dict(extra_http_headers or {})
        self.http_credentials = http_credentials
        self.js_concurrency = max(1, int(js_concurrency))
        self.wait_until = wait_until if wait_until in ("domcontentloaded", "load", "commit") else "domcontentloaded"
        self.extra_wait_ms = max(0, int(extra_wait_ms))
        self.block_resources = bool(block_resources)
        self.capture_console = bool(capture_console)
        self.console_levels = console_levels or frozenset({"error", "warning"})
        self.capture_failed_requests = bool(capture_failed_requests)
        self.console_max_per_page = max(1, int(console_max_per_page))
        self.run_axe = bool(run_axe)

        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._thread: Optional[threading.Thread] = None
        self._ready = threading.Event()
        self._startup_error: Optional[BaseException] = None
        self._closed = False
        self._jobs: asyncio.Queue[_FetchJob | None] | None = None

        self._thread = threading.Thread(target=self._run_loop_thread, name="browser-fetcher", daemon=True)
        self._thread.start()
        if not self._ready.wait(timeout=60):
            raise RuntimeError("Browser fetcher failed to start within 60 seconds")
        if self._startup_error is not None:
            raise RuntimeError(_BROWSER_INSTALL_MSG) from self._startup_error

    def _run_loop_thread(self) -> None:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        self._loop = loop
        try:
            loop.run_until_complete(self._async_main())
        except BaseException as e:
            self._startup_error = e
            self._ready.set()
        finally:
            try:
                pending = asyncio.all_tasks(loop)
                for task in pending:
                    task.cancel()
                if pending:
                    loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            except Exception:
                pass
            loop.close()

    async def _async_main(self) -> None:
        from playwright.async_api import async_playwright

        self._jobs = asyncio.Queue()
        playwright = await async_playwright().start()
        chrome_path = (os.environ.get("CHROME_PATH") or "").strip() or None
        launch_kwargs: dict[str, Any] = {
            "headless": True,
            "args": list(_DEFAULT_CHROME_ARGS),
        }
        if chrome_path:
            launch_kwargs["executable_path"] = chrome_path

        browser = await playwright.chromium.launch(**launch_kwargs)
        context_kwargs: dict[str, Any] = {"user_agent": self.user_agent}
        if self.extra_http_headers:
            context_kwargs["extra_http_headers"] = self.extra_http_headers
        if self.http_credentials:
            context_kwargs["http_credentials"] = self.http_credentials
        context = await browser.new_context(**context_kwargs)
        semaphore = asyncio.Semaphore(self.js_concurrency)
        pages: list[Any] = []
        for _ in range(self.js_concurrency):
            page = await context.new_page()
            if self.block_resources:

                async def _route_handler(route: Any, request: Any) -> None:
                    if request.resource_type in _BLOCKED_RESOURCE_TYPES:
                        await route.abort()
                    else:
                        await route.continue_()

                await page.route("**/*", _route_handler)
            pages.append(page)
        page_queue: asyncio.Queue[Any] = asyncio.Queue()
        for page in pages:
            await page_queue.put(page)

        async def worker() -> None:
            assert self._jobs is not None
            while True:
                job = await self._jobs.get()
                if job is None:
                    self._jobs.task_done()
                    break
                page = await page_queue.get()
                try:
                    async with semaphore:
                        result = await self._fetch_page(page, job.url)
                    if not job.future.done():
                        job.future.set_result(result)
                except Exception:
                    if not job.future.done():
                        job.future.set_result(
                            FetchResult(
                                status=None,
                                content_type=None,
                                text=None,
                                response_time_ms=None,
                                content_length=None,
                                final_url=job.url,
                                headers_dict={},
                                redirect_chain_length=0,
                                fetch_method="rendered",
                            )
                        )
                finally:
                    await page_queue.put(page)
                    self._jobs.task_done()

        workers = [asyncio.create_task(worker()) for _ in range(self.js_concurrency)]
        self._ready.set()
        try:
            await asyncio.gather(*workers)
        finally:
            for page in pages:
                try:
                    await page.close()
                except Exception:
                    pass
            try:
                await context.close()
            except Exception:
                pass
            try:
                await browser.close()
            except Exception:
                pass
            try:
                await playwright.stop()
            except Exception:
                pass

    def _diagnostics_enabled(self) -> bool:
        return self.capture_console or self.capture_failed_requests

    async def _fetch_page(self, page: Any, url: str) -> FetchResult:
        t0 = time.perf_counter()
        response = None
        collector: Optional[_PageDiagnosticsCollector] = None
        if self._diagnostics_enabled():
            collector = _PageDiagnosticsCollector(
                capture_console=self.capture_console,
                console_levels=self.console_levels,
                capture_failed_requests=self.capture_failed_requests,
                max_per_page=self.console_max_per_page,
            )
            collector.attach(page)

        # Record main-frame navigation responses in order so that (a) a response
        # that was received is not lost when goto raises, and (b) we can report
        # the URL's OWN status (e.g. a 301) instead of the followed destination.
        nav_responses: list[Any] = []

        def _on_response(resp: Any) -> None:
            try:
                req = resp.request
                if req.is_navigation_request() and resp.frame == page.main_frame:
                    nav_responses.append(resp)
            except Exception:
                pass

        page.on("response", _on_response)
        try:
            try:
                response = await page.goto(
                    url,
                    wait_until=self.wait_until,
                    timeout=self.timeout * 1000,
                )
            except Exception:
                response = None

            if self.extra_wait_ms and response is not None:
                await asyncio.sleep(self.extra_wait_ms / 1000.0)
        finally:
            try:
                page.remove_listener("response", _on_response)
            except Exception:
                pass
            if collector is not None:
                collector.detach(page)

        response_time_ms = int((time.perf_counter() - t0) * 1000)
        final_url = page.url or url
        browser_diagnostics = collector.build() if collector is not None else None

        # Prefer the first observed main-frame response: this is the URL's own
        # response (a 3xx redirect or an error status), not the final hop.
        own_response = nav_responses[0] if nav_responses else response
        if own_response is None:
            return FetchResult(
                status=None,
                content_type=None,
                text=None,
                response_time_ms=response_time_ms,
                content_length=0,
                final_url=final_url,
                headers_dict={},
                redirect_chain_length=1 if final_url != url else 0,
                fetch_method="rendered",
                browser_diagnostics=browser_diagnostics,
            )

        status = own_response.status
        redirect_chain_length = sum(
            1 for r in nav_responses if 300 <= int(getattr(r, "status", 0) or 0) < 400
        )
        headers = own_response.headers or {}
        lower_headers = {str(k).lower(): v for k, v in headers.items()}
        ct = lower_headers.get("content-type", "")
        headers_dict = {
            k: (headers.get(k) or lower_headers.get(k.lower(), "")) for k in HEADER_KEYS
        }

        is_redirect = 300 <= status < 400
        # Capture body for 2xx and error (4xx/5xx) HTML pages; skip redirects.
        is_html = (not is_redirect) and (
            "text/html" in ct or "application/xhtml+xml" in ct
        )
        text: Optional[str] = None
        content_length = 0
        if is_html:
            try:
                text = await page.content()
                content_length = len(text.encode("utf-8")) if text else 0
            except Exception:
                text = None
            if self.run_axe and text:
                from ..axe_runner import run_axe_on_page

                axe_violations = await run_axe_on_page(page)
                if axe_violations:
                    if browser_diagnostics is None:
                        browser_diagnostics = finalize_browser_diagnostics([], [], [])
                    browser_diagnostics["axe_violations"] = axe_violations

        return FetchResult(
            status=status,
            content_type=ct,
            text=text,
            response_time_ms=response_time_ms,
            content_length=content_length,
            final_url=final_url,
            headers_dict=headers_dict,
            redirect_chain_length=redirect_chain_length,
            fetch_method="rendered",
            browser_diagnostics=browser_diagnostics,
        )

    def fetch(self, url: str) -> FetchResult:
        if self._closed:
            return FetchResult(
                status=None,
                content_type=None,
                text=None,
                response_time_ms=None,
                content_length=None,
                final_url=url,
                headers_dict={},
                redirect_chain_length=0,
                fetch_method="rendered",
            )
        assert self._loop is not None and self._jobs is not None
        fut: Future[FetchResult] = Future()
        job = _FetchJob(url=url, future=fut)

        def _submit() -> None:
            assert self._jobs is not None
            self._jobs.put_nowait(job)

        self._loop.call_soon_threadsafe(_submit)
        total_timeout = self.timeout + (self.extra_wait_ms / 1000.0) + 15
        try:
            return fut.result(timeout=total_timeout)
        except Exception:
            return FetchResult(
                status=None,
                content_type=None,
                text=None,
                response_time_ms=None,
                content_length=None,
                final_url=url,
                headers_dict={},
                redirect_chain_length=0,
                fetch_method="rendered",
            )

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._loop is None or self._jobs is None:
            return
        for _ in range(self.js_concurrency):
            self._loop.call_soon_threadsafe(self._jobs.put_nowait, None)
        if self._thread is not None and self._thread.is_alive():
            self._thread.join(timeout=10)
            if self._thread.is_alive():  # pragma: no cover - join-timeout path
                logger.warning(
                    "BrowserFetcher event-loop thread did not exit within 10s; "
                    "the browser/Chromium process may not have shut down cleanly."
                )
