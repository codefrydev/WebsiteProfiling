"""Static HTTP fetcher using requests."""

from __future__ import annotations

import time
from typing import Optional

import requests

from .base import HEADER_KEYS, FetchResult


class StaticFetcher:
    def __init__(
        self,
        *,
        timeout: int = 12,
        user_agent: str = "WebsiteProfilingCrawler/1.0",
        session: Optional[requests.Session] = None,
    ) -> None:
        self.timeout = timeout
        self.session = session or requests.Session()
        if session is None:
            self.session.headers.update({"User-Agent": user_agent})
        self._owns_session = session is None

    def fetch(self, url: str) -> FetchResult:
        try:
            t0 = time.perf_counter()
            resp = self.session.get(url, timeout=self.timeout, allow_redirects=True)
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
        if self._owns_session:
            self.session.close()
