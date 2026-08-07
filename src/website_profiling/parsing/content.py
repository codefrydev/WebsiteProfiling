"""Content text and social meta parsing."""
from __future__ import annotations

from ..content_analysis.page import analyze_page_html


def _count_syllables(word: str) -> int:
    from ..content_analysis.reading_level import count_syllables

    return count_syllables(word)


def parse_content_text(
    soup,
    raw_html: str,
    excerpt_max_chars: int = 0,
    *,
    main_content_selectors: str | None = None,
    boilerplate_selectors: str | None = None,
) -> dict:
    """Extract content analytics: word count, reading level, content-to-HTML ratio, top keywords.

    excerpt_max_chars: when > 0, strip script/style from body and store a whitespace-normalized
    plain-text excerpt (truncated) in ``content_excerpt`` for analysis / AI / UI.
    """
    del soup  # analyze_page_html loads from raw_html for a single code path
    return analyze_page_html(
        raw_html,
        excerpt_max_chars=excerpt_max_chars,
        strategy="full_body",
        main_content_selectors=main_content_selectors,
        boilerplate_selectors=boilerplate_selectors,
    )


def parse_social_meta(soup) -> dict:
    """Extract Open Graph and Twitter Card meta tags."""
    def _meta_content(attrs: dict) -> str:
        tag = soup.find("meta", attrs=attrs)
        return (tag.get("content") or "").strip() if tag else ""

    return {
        "og_title": _meta_content({"property": "og:title"}),
        "og_description": _meta_content({"property": "og:description"}),
        "og_image": _meta_content({"property": "og:image"}),
        "og_type": _meta_content({"property": "og:type"}),
        "twitter_card": _meta_content({"name": "twitter:card"}),
        "twitter_title": _meta_content({"name": "twitter:title"}),
        "twitter_image": _meta_content({"name": "twitter:image"}),
    }
