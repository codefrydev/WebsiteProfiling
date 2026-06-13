"""Plain-text extraction from a DOM subtree."""
from __future__ import annotations

from bs4 import BeautifulSoup, Tag


def extract_text(root: Tag | BeautifulSoup) -> str:
    return root.get_text(separator=" ", strip=True) if root is not None else ""
