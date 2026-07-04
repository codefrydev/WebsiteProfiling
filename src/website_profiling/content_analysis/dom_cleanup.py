"""Remove non-content DOM nodes before text extraction."""
from __future__ import annotations

from bs4 import BeautifulSoup

from .constants import CHROME_SELECTORS, CONTENT_ROOT_SELECTORS


def cleanup_dom(
    soup: BeautifulSoup,
    *,
    boilerplate_selectors: str | None = None,
    content_root_selectors: str | None = None,
) -> BeautifulSoup:
    """Strip non-content DOM nodes. `boilerplate_selectors`/`content_root_selectors`
    override the CHROME_SELECTORS/CONTENT_ROOT_SELECTORS defaults (e.g. from a
    user-configured pipeline) when provided."""
    for tag in soup.find_all(["script", "style", "noscript"]):
        tag.decompose()

    chrome_sel = boilerplate_selectors if boilerplate_selectors else CHROME_SELECTORS
    root_sel = content_root_selectors if content_root_selectors else CONTENT_ROOT_SELECTORS
    protected = set(soup.select(root_sel))
    for tag in soup.select(chrome_sel):
        if tag in protected:
            continue
        tag.decompose()

    for tag in soup.find_all(attrs={"aria-hidden": "true"}):
        tag.decompose()
    return soup
