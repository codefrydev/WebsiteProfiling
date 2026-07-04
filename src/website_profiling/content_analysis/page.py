"""Per-page content analysis orchestration."""
from __future__ import annotations

from typing import Literal

from .dom_cleanup import cleanup_dom
from .excerpt import build_excerpt
from .html_loader import load_soup
from .html_ratio import content_html_ratio
from .keywords import top_keywords_json
from .main_content import find_main_content
from .reading_level import flesch_kincaid_grade
from .text_extract import extract_text
from .tokenize import count_words, tokenize_words

ContentStrategy = Literal["main_only", "full_body"]

CONTENT_FIELDS = (
    "word_count",
    "reading_level",
    "content_html_ratio",
    "top_keywords",
    "content_excerpt",
)


def analyze_page_html(
    raw_html: str,
    *,
    excerpt_max_chars: int = 0,
    strategy: ContentStrategy = "main_only",
    main_content_selectors: str | None = None,
    boilerplate_selectors: str | None = None,
) -> dict:
    """Analyze stored HTML and return crawl row content fields."""
    soup = load_soup(raw_html)
    cleaned = cleanup_dom(soup, boilerplate_selectors=boilerplate_selectors)
    root = find_main_content(cleaned, strategy=strategy, selectors=main_content_selectors)
    body_text = extract_text(root)
    words = tokenize_words(body_text)
    return {
        "word_count": count_words(words),
        "reading_level": flesch_kincaid_grade(words, body_text),
        "content_html_ratio": content_html_ratio(body_text, raw_html),
        "top_keywords": top_keywords_json(words),
        "content_excerpt": build_excerpt(body_text, excerpt_max_chars),
    }
