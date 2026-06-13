"""Remove non-content DOM nodes before text extraction."""
from __future__ import annotations

from bs4 import BeautifulSoup

from .constants import CHROME_TAGS


def cleanup_dom(soup: BeautifulSoup) -> BeautifulSoup:
    for tag in soup.find_all(["script", "style", "noscript"]):
        tag.decompose()
    for tag in soup.find_all(CHROME_TAGS):
        tag.decompose()
    for tag in soup.find_all(attrs={"aria-hidden": "true"}):
        tag.decompose()
    return soup
