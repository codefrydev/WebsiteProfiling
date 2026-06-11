"""Shared text helpers for content analysis and LLM enrichment."""
from __future__ import annotations

import json
import re

import pandas as pd

from .text_hygiene import is_junk_semantic_term


def top_keywords_as_text(row: pd.Series, max_terms: int = 15) -> str:
    if "top_keywords" not in row.index:
        return ""
    raw = row.get("top_keywords")
    if raw is None or (isinstance(raw, float) and pd.isna(raw)):
        return ""
    s = str(raw).strip()
    if not s or s == "[]":
        return ""
    try:
        arr = json.loads(s)
        if not isinstance(arr, list):
            return ""
        words: list[str] = []
        for item in arr[:max_terms]:
            if isinstance(item, dict) and item.get("word"):
                word = str(item["word"]).strip()
                if word and not is_junk_semantic_term(word):
                    words.append(word)
        return " ".join(words)
    except json.JSONDecodeError:
        return ""


def normalize_fingerprint_text(row: pd.Series) -> str:
    """Concatenate on-page text signals for duplicates, language, and LLM context.

    heading_sequence is excluded — it stores tag names (h1,h2), not heading copy.
    Prefer heading_text (actual H2–H6 copy) when present.
    """
    parts: list[str] = []
    for col in (
        "title",
        "h1",
        "meta_description",
        "heading_text",
        "og_title",
        "og_description",
        "twitter_title",
        "content_excerpt",
    ):
        if col not in row.index:
            continue
        v = row.get(col)
        if v is None or (isinstance(v, float) and pd.isna(v)):
            continue
        s = str(v).strip()
        if s:
            parts.append(s)
    kw_extra = top_keywords_as_text(row)
    if kw_extra:
        parts.append(kw_extra)
    t = " ".join(parts).lower()
    t = re.sub(r"\s+", " ", t)
    return t[:12000]
