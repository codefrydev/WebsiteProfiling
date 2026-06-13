"""Load BeautifulSoup from raw HTML."""
from __future__ import annotations

from bs4 import BeautifulSoup


def load_soup(raw_html: str) -> BeautifulSoup:
    return BeautifulSoup(raw_html or "", "lxml")
