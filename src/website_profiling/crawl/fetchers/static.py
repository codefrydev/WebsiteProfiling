"""Static HTTP fetcher using requests."""

from __future__ import annotations

import threading
import time
from typing import Callable, Optional
from urllib.parse import urljoin

import requests

from .base import HEADER_KEYS, FetchResult


def _read_capped_pdf_body(resp: "requests.Response", max_bytes: int) -> tuple[Optional[bytes], int]:
    """Stream a PDF response body, bailing out to (None, size) if it exceeds
    max_bytes per Content-Length or during actual download — never buffers an
    oversized PDF fully in memory just to discard it."""
    declared = resp.headers.get("Content-Length", "")
    if declared.isdigit() and int(declared) > max_bytes:
        resp.close()
        return None, int(declared)
    chunks = bytearray()
    for chunk in resp.iter_content(chunk_size=65536):
        chunks.extend(chunk)
        if len(chunks) > max_bytes:
            return None, len(chunks)
    return bytes(chunks), len(chunks)


class StaticFetcher:
    """Fetch pages over HTTP.

    ``requests.Session`` is not documented as thread-safe, so when this fetcher
    is shared across worker threads each thread gets its own session built
    lazily from ``session_factory``. Pass ``session`` (without a factory) to
    keep the legacy single-shared-session behaviour for single-threaded callers.
    """

    def __init__(
        self,
        *,
        timeout: int = 12,
        user_agent: str = "WebsiteProfilingCrawler/1.0",
        session: Optional[requests.Session] = None,
        session_factory: Optional[Callable[[], requests.Session]] = None,
        max_pdf_bytes: int = 10_485_760,
    ) -> None:
        self.timeout = timeout
        self.max_pdf_bytes = max_pdf_bytes
        self._user_agent = user_agent
        self._explicit_session = session
        if session_factory is not None:
            # Per-thread sessions built from the caller's factory.
            self._session_factory: Optional[Callable[[], requests.Session]] = session_factory
        elif session is not None:
            # Legacy: a single caller-owned session shared as-is.
            self._session_factory = None
        else:
            # No session supplied: own a per-thread default session.
            def _default_factory() -> requests.Session:
                sess = requests.Session()
                sess.headers.update({"User-Agent": user_agent})
                return sess

            self._session_factory = _default_factory
        self._local = threading.local()
        self._owned_sessions: list[requests.Session] = []
        self._sessions_lock = threading.Lock()

    @property
    def session(self) -> requests.Session:
        """Return the session for the calling thread.

        With a factory, each thread lazily builds (and we track) its own
        session; without one, the single explicit session is returned.
        """
        if self._session_factory is None:
            return self._explicit_session  # type: ignore[return-value]
        existing = getattr(self._local, "session", None)
        if existing is not None:
            return existing
        built = self._session_factory()
        self._local.session = built
        with self._sessions_lock:
            self._owned_sessions.append(built)
        return built

    def fetch(self, url: str) -> FetchResult:
        session = self.session
        try:
            t0 = time.perf_counter()
            # Do NOT auto-follow redirects: we want to record the URL's own
            # response (e.g. 301/308) rather than collapsing the chain into the
            # final 200. The crawler enqueues the Location target so each hop is
            # crawled and recorded as its own row.
            # stream=True is transparent for HTML/other content below (accessing
            # .text/.content still reads the full body) but lets the PDF branch
            # bail out before or during download instead of after.
            resp = session.get(url, timeout=self.timeout, allow_redirects=False, stream=True)
            response_time_ms = int((time.perf_counter() - t0) * 1000)
            ct = resp.headers.get("Content-Type", "")
            location = resp.headers.get("Location") or resp.headers.get("location") or ""
            # A redirect is a 3xx with a Location header (matches requests' own
            # definition; excludes 304 Not Modified).
            is_redirect = resp.status_code in (301, 302, 303, 307, 308) and bool(location)
            # Capture the body for 2xx and error (4xx/5xx) HTML pages so custom
            # error pages can be analysed; redirects have no meaningful body.
            is_html = (not is_redirect) and (
                "text/html" in ct or "application/xhtml+xml" in ct
            )
            is_pdf = (not is_redirect) and "application/pdf" in ct.lower()
            text: Optional[str] = None
            raw_bytes: Optional[bytes] = None
            if is_pdf:
                raw_bytes, content_length = _read_capped_pdf_body(resp, self.max_pdf_bytes)
            else:
                text = resp.text if is_html else None
                content_length = len(resp.content) if resp.content is not None else 0
            if is_redirect:
                final_url = urljoin(url, location)
                redirect_chain_length = 1
            else:
                final_url = resp.url or url
                redirect_chain_length = len(resp.history)
            headers_dict = {k: (resp.headers.get(k) or "") for k in HEADER_KEYS}
            return FetchResult(
                status=resp.status_code,
                content_type=ct,
                text=text,
                response_time_ms=response_time_ms,
                content_length=content_length,
                final_url=final_url,
                headers_dict=headers_dict,
                redirect_chain_length=redirect_chain_length,
                fetch_method="static",
                retry_after_header=(resp.headers.get("Retry-After") or "").strip(),
                raw_bytes=raw_bytes,
            )
        except requests.RequestException:
            return FetchResult(
                status=None,
                content_type=None,
                text=None,
                response_time_ms=None,
                content_length=None,
                final_url=None,
                headers_dict={},
                redirect_chain_length=0,
                fetch_method="static",
            )

    def close(self) -> None:
        if self._session_factory is None:
            # The caller owns the explicit session; leave its lifecycle to them.
            return
        with self._sessions_lock:
            sessions = list(self._owned_sessions)
            self._owned_sessions.clear()
        for sess in sessions:
            sess.close()
