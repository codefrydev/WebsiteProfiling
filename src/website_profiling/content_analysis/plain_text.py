"""Content metrics for already-extracted plain text (e.g. PDF-derived)."""
from __future__ import annotations

from .excerpt import build_excerpt
from .keywords import top_keywords_json
from .reading_level import flesch_kincaid_grade
from .tokenize import count_words, tokenize_words


def analyze_plain_text(body_text: str, *, excerpt_max_chars: int = 0) -> dict:
    """Analyze plain text (no HTML) and return the same content fields as
    analyze_page_html, minus content_html_ratio (a markup-bloat metric that
    doesn't apply to a document with no surrounding markup)."""
    words = tokenize_words(body_text)
    return {
        "word_count": count_words(words),
        "reading_level": flesch_kincaid_grade(words, body_text),
        "top_keywords": top_keywords_json(words),
        "content_excerpt": build_excerpt(body_text, excerpt_max_chars),
    }
