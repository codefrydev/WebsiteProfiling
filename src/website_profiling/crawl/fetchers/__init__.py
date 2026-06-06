"""HTTP and browser fetchers for the website crawler."""

from .base import FetchResult, HEADER_KEYS
from .browser_deps import browser_status, ensure_browser_deps
from .factory import build_fetcher, validate_browser_available

__all__ = [
    "FetchResult",
    "HEADER_KEYS",
    "browser_status",
    "build_fetcher",
    "ensure_browser_deps",
    "validate_browser_available",
]
