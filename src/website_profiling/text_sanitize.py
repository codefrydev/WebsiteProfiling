"""Strip lone UTF-16 surrogates so strings are safe for UTF-8 JSON/HTTP."""
from __future__ import annotations

from typing import Any


def strip_surrogates(text: str) -> str:
    """Replace lone surrogates (invalid in UTF-8) with U+FFFD."""
    if not text:
        return text
    return text.encode("utf-8", errors="replace").decode("utf-8")


def sanitize_unicode_deep(obj: Any) -> Any:
    """Recursively sanitize strings in nested dicts/lists."""
    if isinstance(obj, str):
        return strip_surrogates(obj)
    if isinstance(obj, dict):
        return {k: sanitize_unicode_deep(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [sanitize_unicode_deep(v) for v in obj]
    if isinstance(obj, tuple):
        return tuple(sanitize_unicode_deep(v) for v in obj)
    return obj
