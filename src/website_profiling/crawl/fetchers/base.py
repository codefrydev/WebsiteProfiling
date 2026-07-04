"""Shared fetch result types for static and browser crawlers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal, Optional, Protocol

HEADER_KEYS = (
    "Cache-Control",
    "ETag",
    "X-Robots-Tag",
    "Strict-Transport-Security",
    "X-Content-Type-Options",
    "X-Frame-Options",
    "Content-Security-Policy",
)


@dataclass
class FetchResult:
    status: Optional[int]
    content_type: Optional[str]
    text: Optional[str]
    response_time_ms: Optional[int]
    content_length: Optional[int]
    final_url: Optional[str]
    headers_dict: dict[str, str]
    redirect_chain_length: int
    fetch_method: Literal["static", "rendered"] = "static"
    browser_diagnostics: Optional[dict[str, Any]] = None
    fetch_blocked: bool = False
    retry_after_header: str = ""
    raw_bytes: Optional[bytes] = None

    def as_tuple(self) -> tuple:
        """Legacy tuple shape used by Crawler.worker."""
        return (
            self.status,
            self.content_type,
            self.text,
            self.response_time_ms,
            self.content_length,
            self.final_url,
            self.headers_dict,
            self.redirect_chain_length,
        )


class PageFetcher(Protocol):
    def fetch(self, url: str) -> FetchResult: ...

    def close(self) -> None: ...
