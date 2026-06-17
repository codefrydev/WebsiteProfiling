"""Static HTTP fetcher using requests."""

from __future__ import annotations

import threading
import time
from typing import Callable, Optional

import requests

from .base import HEADER_KEYS, FetchResult


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
    ) -> None:
        self.timeout = timeout
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
            resp = session.get(url, timeout=self.timeout, allow_redirects=True)
            response_time_ms = int((time.perf_counter() - t0) * 1000)
            ct = resp.headers.get("Content-Type", "")
            is_html = resp.status_code == 200 and (
                "text/html" in ct or "application/xhtml+xml" in ct
            )
            text = resp.text if is_html else None
            content_length = len(resp.content) if resp.content is not None else 0
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
