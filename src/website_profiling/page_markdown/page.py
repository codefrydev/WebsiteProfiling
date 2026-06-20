"""Per-page HTML → markdown extraction."""
from __future__ import annotations

from typing import Any, Literal, Optional

from ..content_analysis.dom_cleanup import cleanup_dom
from ..content_analysis.html_loader import load_soup
from ..content_analysis.main_content import ContentStrategy, find_main_content
from ..content_analysis.text_extract import extract_text
from ..content_analysis.tokenize import count_words, tokenize_words
from .html_to_markdown import html_to_markdown


def _extract_title(soup: Any) -> Optional[str]:
    tag = soup.find("title")
    if tag:
        text = tag.get_text(strip=True)
        if text:
            return text
    # Fallback to first h1
    h1 = soup.find("h1")
    if h1:
        text = h1.get_text(strip=True)
        if text:
            return text
    return None


def extract_page_markdown(
    raw_html: str,
    *,
    strategy: ContentStrategy = "main_only",
) -> dict[str, Any]:
    """Extract markdown and metadata from raw HTML. Returns dict with markdown, title, word_count, source_byte_length."""
    source_byte_length = len(raw_html.encode("utf-8"))
    soup = load_soup(raw_html)
    title = _extract_title(soup)
    cleaned = cleanup_dom(soup)
    root = find_main_content(cleaned, strategy=strategy)
    markdown = html_to_markdown(root)
    body_text = extract_text(root)
    words = tokenize_words(body_text)
    word_count = count_words(words)
    return {
        "title": title,
        "markdown": markdown,
        "word_count": word_count,
        "strategy": strategy,
        "source_byte_length": source_byte_length,
    }
