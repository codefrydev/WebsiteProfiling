"""Reading level (Flesch-Kincaid grade) helpers."""
from __future__ import annotations

import re


def count_syllables(word: str) -> int:
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


def split_sentences(body_text: str) -> list[str]:
    return [s.strip() for s in re.split(r"[.!?]+", body_text or "") if len(s.strip()) > 5]


def flesch_kincaid_grade(words: list[str], body_text: str) -> float:
    word_count = len(words)
    if word_count <= 30:
        return 0.0
    sentence_count = max(1, len(split_sentences(body_text)))
    total_syllables = sum(count_syllables(w) for w in words)
    reading_level = (
        0.39 * (word_count / sentence_count)
        + 11.8 * (total_syllables / max(1, word_count))
        - 15.59
    )
    return max(0.0, min(18.0, round(reading_level, 1)))
