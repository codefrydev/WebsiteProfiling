"""Tests for surrogate stripping in chat/JSON paths."""
from __future__ import annotations

import json

from website_profiling.text_sanitize import sanitize_unicode_deep, strip_surrogates


def test_strip_surrogates_replaces_lone_surrogate() -> None:
    bad = "URL issue\udc9d here"
    cleaned = strip_surrogates(bad)
    assert "\udc9d" not in cleaned
    cleaned.encode("utf-8")


def test_sanitize_unicode_deep_nested() -> None:
    payload = {
        "issues": [{"message": "broken\udc9d", "url": "https://example.com"}],
    }
    cleaned = sanitize_unicode_deep(payload)
    serialized = json.dumps(cleaned, ensure_ascii=False)
    serialized.encode("utf-8")


def test_sanitize_unicode_deep_tuple() -> None:
    cleaned = sanitize_unicode_deep(("ok\udc9d", {"nested": "x\udc9d"}))
    assert isinstance(cleaned, tuple)
    assert "\udc9d" not in cleaned[0]
    assert "\udc9d" not in cleaned[1]["nested"]


def test_sanitize_unicode_deep_passthrough() -> None:
    assert sanitize_unicode_deep(42) == 42
    assert sanitize_unicode_deep(None) is None
