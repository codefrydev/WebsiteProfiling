"""Build page fetchers from crawl configuration."""

from __future__ import annotations

from typing import Callable, Literal, Optional

import requests

from .base import PageFetcher
from .browser import BrowserFetcher, _BROWSER_INSTALL_MSG
from .browser_deps import browser_status, ensure_browser_deps
from .browser_diagnostics import parse_console_levels
from .hybrid import HybridFetcher
from .static import StaticFetcher

RenderMode = Literal["static", "javascript", "auto"]


def _browser_auth_from_session(
    session: Optional[requests.Session],
) -> tuple[dict[str, str], Optional[dict[str, str]]]:
    """Map requests session auth/headers onto Playwright browser context options."""
    if session is None:
        return {}, None
    headers: dict[str, str] = {}
    for key, value in session.headers.items():
        if str(key).lower() == "user-agent":
            continue
        headers[str(key)] = str(value)
    credentials: Optional[dict[str, str]] = None
    auth = getattr(session, "auth", None)
    # requests also allows a callable auth handler; only basic (user, pass) tuples map here.
    if isinstance(auth, (tuple, list)) and len(auth) >= 1 and auth[0]:
        password = str(auth[1] or "") if len(auth) > 1 else ""
        credentials = {"username": str(auth[0]), "password": password}
    return headers, credentials


def validate_browser_available() -> None:
    """Raise RuntimeError if JS crawl prerequisites are missing."""
    status = ensure_browser_deps()
    if not status["ok"]:
        raise RuntimeError(str(status.get("message") or _BROWSER_INSTALL_MSG))


def _browser_factory(
    *,
    js_timeout: int,
    user_agent: str,
    js_concurrency: int,
    js_wait_until: str,
    js_extra_wait_ms: int,
    js_block_resources: bool,
    capture_console: bool = True,
    console_levels: frozenset[str] | None = None,
    capture_failed_requests: bool = False,
    console_max_per_page: int = 20,
    run_axe: bool = False,
    extra_http_headers: Optional[dict[str, str]] = None,
    http_credentials: Optional[dict[str, str]] = None,
) -> Callable[[], PageFetcher]:
    def _make() -> PageFetcher:
        return BrowserFetcher(
            timeout=js_timeout,
            user_agent=user_agent,
            js_concurrency=js_concurrency,
            wait_until=js_wait_until,
            extra_wait_ms=js_extra_wait_ms,
            block_resources=js_block_resources,
            capture_console=capture_console,
            console_levels=console_levels,
            capture_failed_requests=capture_failed_requests,
            console_max_per_page=console_max_per_page,
            run_axe=run_axe,
            extra_http_headers=extra_http_headers or {},
            http_credentials=http_credentials,
        )

    return _make


def build_fetcher(
    *,
    render_mode: RenderMode = "static",
    timeout: int = 12,
    user_agent: str = "WebsiteProfilingCrawler/1.0",
    session: Optional[requests.Session] = None,
    session_factory: Optional[Callable[[], requests.Session]] = None,
    js_concurrency: int = 3,
    js_timeout: int = 30,
    js_wait_until: str = "domcontentloaded",
    js_extra_wait_ms: int = 1500,
    js_block_resources: bool = True,
    capture_console: bool = True,
    js_console_levels: str = "error,warning",
    capture_failed_requests: bool = False,
    console_max_per_page: int = 20,
    run_axe: bool = False,
    max_pdf_bytes: int = 10_485_760,
) -> PageFetcher:
    mode = (render_mode or "static").strip().lower()
    levels = parse_console_levels(js_console_levels)
    extra_http_headers, http_credentials = _browser_auth_from_session(session)
    browser_kwargs = dict(
        js_timeout=js_timeout,
        user_agent=user_agent,
        js_concurrency=js_concurrency,
        js_wait_until=js_wait_until,
        js_extra_wait_ms=js_extra_wait_ms,
        js_block_resources=js_block_resources,
        capture_console=capture_console,
        console_levels=levels,
        capture_failed_requests=capture_failed_requests,
        console_max_per_page=console_max_per_page,
        run_axe=run_axe,
        extra_http_headers=extra_http_headers,
        http_credentials=http_credentials,
    )
    if mode == "javascript":
        validate_browser_available()
        return _browser_factory(**browser_kwargs)()
    static = StaticFetcher(
        timeout=timeout,
        user_agent=user_agent,
        session=session,
        session_factory=session_factory,
        max_pdf_bytes=max_pdf_bytes,
    )
    if mode == "static":
        return static
    if mode == "auto":
        validate_browser_available()
        return HybridFetcher(
            static,
            _browser_factory(**browser_kwargs),
        )
    return static
