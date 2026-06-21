"""Static-first fetcher with optional JavaScript fallback for SPA shells."""

from __future__ import annotations

import threading
from typing import Callable, Optional

from .base import FetchResult, PageFetcher
from .spa_heuristics import needs_js_render


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
