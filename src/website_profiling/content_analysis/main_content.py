"""Select the primary content root element from a page."""
from __future__ import annotations

from typing import Literal

from bs4 import BeautifulSoup, Tag

from .constants import CONTENT_ROOT_SELECTORS

ContentStrategy = Literal["main_only", "full_body"]


def find_main_content(
    soup: BeautifulSoup,
    strategy: ContentStrategy = "main_only",
    *,
    selectors: str | None = None,
) -> Tag | BeautifulSoup:
    """Pick the first non-empty match from a comma-joined CSS selector
    priority list (tried in order, NOT CSS selector-group/document-order
    semantics), falling back to <body>. `selectors` overrides the default
    CONTENT_ROOT_SELECTORS list (e.g. from a user-configured pipeline)."""
    if strategy == "full_body":
        return soup.find("body") or soup

    candidate_selectors = selectors if selectors else CONTENT_ROOT_SELECTORS
    for candidate in (s.strip() for s in candidate_selectors.split(",")):
        if not candidate:
            continue
        el = soup.select_one(candidate)
        if el is not None and (el.get_text(separator=" ", strip=True) or "").strip():
            return el
    return soup.find("body") or soup
