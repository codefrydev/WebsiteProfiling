"""Plain-text excerpt generation."""
from __future__ import annotations

import re


def build_excerpt(body_text: str, max_chars: int) -> str:
    if not max_chars or max_chars <= 0 or not body_text:
        return ""
    excerpt = re.sub(r"\s+", " ", body_text.strip())
    if len(excerpt) <= max_chars:
        return excerpt
    truncated = excerpt[:max_chars].rsplit(" ", 1)[0].strip()
    return truncated or excerpt[:max_chars]
