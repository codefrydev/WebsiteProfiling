"""Content text and social meta parsing."""
from __future__ import annotations

import json

_STOP_WORDS = frozenset({
    "the", "and", "for", "that", "this", "with", "from", "your", "have", "are",
    "was", "were", "been", "will", "would", "could", "should", "about", "which",
    "their", "there", "what", "when", "where", "more", "some", "than", "them",
    "other", "into", "over", "also", "just", "after", "before", "only", "then",
    "very", "most", "each", "such", "like", "does", "here", "because", "being",
    "well", "while", "these", "those", "both", "many", "much", "even", "back",
    "through", "still", "between", "every", "under", "last", "long", "great",
    "make", "same", "come", "take", "know", "they", "page", "site", "home",
    "click", "read", "view", "next", "menu", "main", "skip", "content", "link",
    "http", "https", "www", "html", "class", "none", "true", "false", "null",
})


def _count_syllables(word: str) -> int:
    word = word.lower().strip()
    if len(word) <= 3:
        return 1
    vowels = "aeiouy"
    count = 0
    prev_vowel = False
    for ch in word:
        is_vowel = ch in vowels
        if is_vowel and not prev_vowel:
            count += 1
        prev_vowel = is_vowel
    if word.endswith("e") and count > 1:
        count -= 1
    return max(1, count)


def parse_content_text(soup, raw_html: str, excerpt_max_chars: int = 0) -> dict:
    """Extract content analytics: word count, reading level, content-to-HTML ratio, top keywords.

    excerpt_max_chars: when > 0, strip script/style from body and store a whitespace-normalized
    plain-text excerpt (truncated) in ``content_excerpt`` for analysis / AI / UI.
    """
    import re
    from collections import Counter

    body = soup.find("body")
    if body:
        for tag in body.find_all(["script", "style", "noscript"]):
            tag.decompose()
    body_text = body.get_text(separator=" ", strip=True) if body else ""
    words = [w for w in re.findall(r"[a-zA-Z]+", body_text) if len(w) >= 2]
    word_count = len(words)

    sentences = [s.strip() for s in re.split(r"[.!?]+", body_text) if len(s.strip()) > 5]
    sentence_count = max(1, len(sentences))

    total_syllables = sum(_count_syllables(w) for w in words) if words else 0

    reading_level = 0.0
    if word_count > 30:
        reading_level = (
            0.39 * (word_count / sentence_count)
            + 11.8 * (total_syllables / max(1, word_count))
            - 15.59
        )
        reading_level = max(0.0, min(18.0, round(reading_level, 1)))

    html_len = max(1, len(raw_html))
    content_html_ratio = round(len(body_text) / html_len * 100, 1)

    keyword_words = [w.lower() for w in words if len(w) >= 4 and w.lower() not in _STOP_WORDS]
    top_keywords = Counter(keyword_words).most_common(10)
    max_kw = top_keywords[0][1] if top_keywords else 0
    kw_rows = []
    for w, c in top_keywords:
        score = round(100 * c / max_kw) if max_kw else 0
        kw_rows.append({"word": w, "count": c, "score": int(score)})

    excerpt = ""
    if excerpt_max_chars and excerpt_max_chars > 0 and body_text:
        excerpt = re.sub(r"\s+", " ", body_text.strip())
        if len(excerpt) > excerpt_max_chars:
            excerpt = excerpt[: excerpt_max_chars].rsplit(" ", 1)[0].strip() or excerpt[:excerpt_max_chars]

    return {
        "word_count": word_count,
        "reading_level": reading_level,
        "content_html_ratio": content_html_ratio,
        "top_keywords": json.dumps(kw_rows),
        "content_excerpt": excerpt,
    }


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
