"""Detect SPA shells that benefit from JavaScript re-fetch."""

from __future__ import annotations

from .base import FetchResult

_SPA_MARKERS = (
    "__NEXT_DATA__",
    'id="root"',
    "id='root'",
    'id="app"',
    "id='app'",
    "data-reactroot",
    "cdn.shopify.com",
    "__NUXT__",
    "window.__INITIAL_STATE__",
    "_next/static",
    "__REACT_DEVTOOLS",
    "react.production.min",
    "__vue",
    "vue.min.js",
    "ng-version",
    "ng-app",
    "svelte",
)


def _has_spa_markers(html: str) -> bool:
    lower = html.lower()
    return any(marker.lower() in lower for marker in _SPA_MARKERS)


def _html_word_count(html: str) -> int:
    from bs4 import BeautifulSoup

    try:
        text = BeautifulSoup(html, "lxml").get_text(separator=" ", strip=True)
        return len(text.split())
    except Exception:
        return 0


def needs_js_render(result: FetchResult) -> bool:
    """True when static HTML looks like a client-rendered shell."""
    if result.fetch_method == "rendered":
        return False
    if result.status != 200 or not result.text:
        return False
    html = result.text
    html_len = len(html)
    if html_len == 0:
        return False

    lower = html.lower()
    if _has_spa_markers(html):
        return True

    script_count = lower.count("<script")
    if script_count >= 8 and html_len < 8000:
        return True

    word_count = _html_word_count(html)
    if word_count < 40 and script_count >= 3 and html_len > 1500:
        return True

    return False


def needs_js_render_after_parse(
    result: FetchResult,
    *,
    link_count: int,
    same_domain_link_count: int,
) -> bool:
    """True when parsed static HTML has too few links for a likely SPA shell."""
    if result.fetch_method == "rendered":
        return False
    if result.status != 200 or not result.text:
        return False
    html = result.text
    html_len = len(html)
    if html_len == 0:
        return False
    if same_domain_link_count > 1:
        return False

    lower = html.lower()
    script_count = lower.count("<script")
    word_count = _html_word_count(html)
    has_signal = (
        _has_spa_markers(html)
        or (script_count >= 3 and word_count < 40)
        or (html_len > 1500 and link_count == 0)
    )
    return has_signal and same_domain_link_count <= 1
