"""Select the primary content root element from a page."""
from __future__ import annotations

from typing import Literal

from bs4 import BeautifulSoup, Tag

ContentStrategy = Literal["main_only", "full_body"]


def find_main_content(soup: BeautifulSoup, strategy: ContentStrategy = "main_only") -> Tag | BeautifulSoup:
    if strategy == "full_body":
        return soup.find("body") or soup

    candidates: list[Tag | None] = [
        soup.find("main"),
        soup.find("article"),
        soup.find(attrs={"role": "main"}),
        soup.find(id="content"),
        soup.find(class_="content"),
    ]
    for el in candidates:
        if el is not None and (el.get_text(separator=" ", strip=True) or "").strip():
            return el
    return soup.find("body") or soup
