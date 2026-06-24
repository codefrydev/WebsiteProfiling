"""Word tokenization for content metrics."""
from __future__ import annotations

import re


def tokenize_words(body_text: str) -> list[str]:
    # [^\W\d_] = any Unicode letter (word char that is not a digit or underscore),
    # so accented/non-Latin scripts (café, München, 日本語) are kept intact. The
    # old [a-zA-Z]+ silently dropped every non-ASCII letter, corrupting word
    # counts, reading level, and keyword extraction for non-English content.
    return [w for w in re.findall(r"[^\W\d_]+", body_text or "", re.UNICODE) if len(w) >= 2]


def count_words(tokens: list[str]) -> int:
    return len(tokens)
