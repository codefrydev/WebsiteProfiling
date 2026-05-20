"""
Datamuse API — free semantic keyword expansion (no auth, no API key).
https://api.datamuse.com

Provides:
  - means_like:    words with similar meaning (ml= parameter)
  - triggered_by:  words strongly associated/triggered by a concept (rel_trg= parameter)
  - synonyms:      synonyms (rel_syn= parameter)

All requests are free with no stated rate limit.
"""
from __future__ import annotations

import time
from typing import Any

import requests

DATAMUSE_BASE = "https://api.datamuse.com/words"
USER_AGENT = "WebsiteProfilingKeywordEnricher/1.0"


def _fetch(params: dict[str, str], max_n: int = 10, timeout: float = 6.0) -> list[str]:
    """Fetch words from datamuse, return plain list."""
    try:
        resp = requests.get(
            DATAMUSE_BASE,
            params={**params, "max": str(max_n)},
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        resp.raise_for_status()
        return [item["word"] for item in resp.json() if "word" in item]
    except Exception:
        return []


def find_related(keyword: str, max_n: int = 10) -> dict[str, list[str]]:
    """
    Returns { "means_like": [...], "triggered_by": [...], "synonyms": [...] }
    for a single keyword. Empty lists on error.
    """
    kw = keyword.strip()
    if not kw:
        return {"means_like": [], "triggered_by": [], "synonyms": []}

    means_like = _fetch({"ml": kw}, max_n=max_n)
    time.sleep(0.1)
    triggered_by = _fetch({"rel_trg": kw}, max_n=max_n)
    time.sleep(0.1)
    synonyms = _fetch({"rel_syn": kw}, max_n=max_n)

    return {
        "means_like": means_like,
        "triggered_by": triggered_by,
        "synonyms": synonyms,
    }


def batch_find_related(
    keywords: list[str],
    max_n: int = 8,
    delay: float = 0.3,
    max_batch: int = 200,
) -> dict[str, dict[str, list[str]]]:
    """
    Batch find related words for a list of keywords.
    Returns { keyword: {means_like, triggered_by, synonyms} }
    """
    results: dict[str, dict[str, list[str]]] = {}
    for i, kw in enumerate(keywords[:max_batch]):
        if i > 0:
            time.sleep(delay)
        results[kw] = find_related(kw, max_n=max_n)
    return results
