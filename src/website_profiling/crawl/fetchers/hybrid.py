"""Static-first fetcher with optional JavaScript fallback for SPA shells."""

from __future__ import annotations

import threading
import time
from dataclasses import replace
from typing import Callable, Optional

from .base import FetchResult, PageFetcher
from .bot_block import is_bot_block_status
from .spa_heuristics import needs_js_render


def _retry_after_seconds(raw: str, *, default: float = 1.0, cap: float = 10.0) -> float:
    """Parse a Retry-After header (integer-seconds form only), capped for safety."""
    value = (raw or "").strip()
    if value.isdigit():
        return min(float(value), cap)
    return default


class HybridFetcher:
    """Try static HTTP first; re-fetch with browser when SPA heuristics match."""

    def __init__(
        self,
        static: PageFetcher,
        browser_factory: Callable[[], PageFetcher],
    ) -> None:
        self._static = static
        self._browser_factory = browser_factory
        self._browser_instance: Optional[PageFetcher] = None
        self._browser_lock = threading.Lock()

    def _get_browser(self) -> PageFetcher:
        # Double-checked locking: crawler worker threads share one HybridFetcher,
        # so an unsynchronized check-then-act would let two threads each build a
        # BrowserFetcher (launching a Chromium process + daemon thread); the
        # second assignment orphans the first, leaking it for the process lifetime.
        if self._browser_instance is None:
            with self._browser_lock:
                if self._browser_instance is None:
                    self._browser_instance = self._browser_factory()
        return self._browser_instance

    def fetch(self, url: str) -> FetchResult:
        static_result = self._static.fetch(url)
        if is_bot_block_status(static_result.status):
            if static_result.status == 429:
                time.sleep(_retry_after_seconds(static_result.retry_after_header))
                static_result = self._static.fetch(url)
            if is_bot_block_status(static_result.status):
                rendered = self._get_browser().fetch(url)
                if is_bot_block_status(rendered.status):
                    # Both fetch strategies were blocked: report the (real, not
                    # synthesized) browser status but flag it so downstream
                    # content analysis doesn't score the challenge page as thin
                    # content, and no proxy rotation/retry loop is attempted.
                    return replace(rendered, fetch_blocked=True)
                if rendered.status is None and static_result.status is not None:
                    return static_result
                return rendered
            return static_result
        if not needs_js_render(static_result):
            return static_result
        rendered = self._get_browser().fetch(url)
        if rendered.status is None and static_result.status is not None:
            return static_result
        return rendered

    def refetch_rendered(self, url: str) -> FetchResult:
        """Re-fetch with browser (post-parse auto-mode fallback)."""
        rendered = self._get_browser().fetch(url)
        if rendered.status is None:
            static_result = self._static.fetch(url)
            if static_result.status is not None:
                return static_result
        return rendered

    def close(self) -> None:
        self._static.close()
        if self._browser_instance is not None:
            self._browser_instance.close()
            self._browser_instance = None
