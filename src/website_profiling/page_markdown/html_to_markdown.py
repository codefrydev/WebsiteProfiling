"""Convert a BeautifulSoup element/document to a markdown string."""
from __future__ import annotations

import copy
import re

from bs4 import BeautifulSoup, Tag

try:
    import markdownify as _md

    def _convert(element: Tag | BeautifulSoup) -> str:
        return _md.markdownify(str(element), heading_style=_md.ATX, bullets="-")

except ImportError:  # pragma: no cover
    # Graceful degradation if markdownify is not installed (should not happen in prod)
    def _convert(element: Tag | BeautifulSoup) -> str:  # type: ignore[misc]
        return element.get_text(separator="\n", strip=True) if element is not None else ""


def _remove_noise(element: Tag | BeautifulSoup) -> Tag | BeautifulSoup:
    """Return a copy of the element with script/style tags fully removed."""
    cloned = copy.copy(element)
    for tag in cloned.find_all(["script", "style", "noscript"]):
        tag.decompose()
    return cloned


def html_to_markdown(element: Tag | BeautifulSoup) -> str:
    """Convert a BS4 element to clean markdown text, stripping scripts/styles."""
    if element is None:
        return ""
    cleaned = _remove_noise(element)
    md = _convert(cleaned)
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip()
