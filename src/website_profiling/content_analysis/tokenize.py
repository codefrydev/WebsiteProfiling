"""Word tokenization for content metrics."""
from __future__ import annotations

import re


def tokenize_words(body_text: str) -> list[str]:
    return [w for w in re.findall(r"[a-zA-Z]+", body_text or "") if len(w) >= 2]


def count_words(tokens: list[str]) -> int:
    return len(tokens)
