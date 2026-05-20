"""
Google Suggest / Autocomplete expansion (free, no auth).

Endpoints:
  web:     https://suggestqueries.google.com/complete/search?client=firefox&q=SEED&hl=LANG&gl=COUNTRY
  youtube: same + &ds=yt

Also performs question-prefixed expansion (who/what/why/when/where/how/can/should/vs)
to surface People-Also-Ask-style queries without SERP scraping.

Caches results in keyword_suggest_cache SQLite table (TTL-based).
Uses ThreadPoolExecutor for concurrency (default 4 workers).
"""
from __future__ import annotations

import json
import random
import sqlite3
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

import requests

SUGGEST_URL = "https://suggestqueries.google.com/complete/search"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
QUESTION_PREFIXES = [
    "how to", "how do", "how does", "how can",
    "what is", "what are", "what does",
    "why is", "why does", "why are",
    "where is", "where to",
    "when is", "when does",
    "who is", "who are",
    "can i", "can you", "should i",
    "is it",
]


def fetch_suggestions(
    seed: str,
    lang: str = "en",
    country: str = "us",
    source: str = "web",
    timeout: float = 8.0,
) -> list[str]:
    """
    Fetch autocomplete suggestions from Google Suggest.
    source: "web" or "youtube"
    Returns list of suggestion strings (empty on any error).
    """
    params: dict[str, str] = {
        "client": "firefox",
        "q": seed.strip(),
        "hl": lang,
        "gl": country,
    }
    if source == "youtube":
        params["ds"] = "yt"

    try:
        resp = requests.get(
            SUGGEST_URL,
            params=params,
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        resp.raise_for_status()
        data = resp.json()
        if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
            return [str(s) for s in data[1] if s and str(s) != seed]
        return []
    except Exception:
        return []


def expand_questions(
    seed: str,
    lang: str = "en",
    country: str = "us",
    timeout: float = 8.0,
) -> list[str]:
    """
    Fetch PAA-style question suggestions by prefixing seed with question words.
    Returns deduplicated list of question queries.
    """
    results: set[str] = set()
    for prefix in QUESTION_PREFIXES:
        query = f"{prefix} {seed}"
        suggestions = fetch_suggestions(query, lang=lang, country=country, timeout=timeout)
        for s in suggestions:
            if s and s not in results:
                results.add(s)
        time.sleep(random.uniform(0.15, 0.35))
    return sorted(results)


def _fetch_one(
    task: tuple[str, str, str, str],
    timeout: float = 8.0,
) -> tuple[str, str, list[str]]:
    """Worker target: (seed, source, lang, country) -> (seed, source, suggestions)"""
    seed, source, lang, country = task
    time.sleep(random.uniform(0.3, 0.7))  # polite jitter
    if source == "questions":
        results = expand_questions(seed, lang=lang, country=country, timeout=timeout)
    else:
        results = fetch_suggestions(seed, lang=lang, country=country, source=source, timeout=timeout)
    return seed, source, results


def batch_expand(
    seeds: list[str],
    lang: str = "en",
    country: str = "us",
    sources: tuple[str, ...] = ("web", "youtube", "questions"),
    max_workers: int = 4,
    cache_conn: sqlite3.Connection | None = None,
    cache_ttl_days: int = 7,
) -> dict[str, dict[str, list[str]]]:
    """
    Expand a list of seed keywords using Google Suggest.
    Returns { seed: { "web": [...], "youtube": [...], "questions": [...] } }
    Uses concurrent requests and SQLite cache.
    """
    result: dict[str, dict[str, list[str]]] = {
        seed: {s: [] for s in sources} for seed in seeds
    }
    tasks_to_fetch: list[tuple[str, str, str, str]] = []

    for seed in seeds:
        if not seed or not seed.strip():
            continue
        seed = seed.strip().lower()
        for source in sources:
            # Check cache
            if cache_conn is not None:
                cached = _read_cache(cache_conn, seed, source, cache_ttl_days)
                if cached is not None:
                    result[seed][source] = cached
                    continue
            tasks_to_fetch.append((seed, source, lang, country))

    if not tasks_to_fetch:
        return result

    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_one, task): task for task in tasks_to_fetch}
        for future in as_completed(futures):
            try:
                seed, source, suggestions = future.result()
                if seed in result:
                    result[seed][source] = suggestions
                    if cache_conn is not None:
                        _write_cache(cache_conn, seed, source, suggestions)
            except Exception:
                pass

    return result


# ─── Cache helpers ────────────────────────────────────────────────────────────

_CACHE_DDL = """
CREATE TABLE IF NOT EXISTS keyword_suggest_cache (
    cache_key TEXT PRIMARY KEY,
    fetched_at TEXT NOT NULL,
    data TEXT NOT NULL
);
"""


def ensure_cache_table(conn: sqlite3.Connection) -> None:
    conn.execute(_CACHE_DDL)
    conn.commit()


def _cache_key(seed: str, source: str) -> str:
    return f"{source}:{seed}"


def _read_cache(
    conn: sqlite3.Connection,
    seed: str,
    source: str,
    ttl_days: int = 7,
) -> list[str] | None:
    try:
        ensure_cache_table(conn)
        cur = conn.execute(
            "SELECT fetched_at, data FROM keyword_suggest_cache WHERE cache_key = ?",
            (_cache_key(seed, source),),
        )
        row = cur.fetchone()
        if row is None:
            return None
        fetched_at = datetime.fromisoformat(row[0].replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 86400
        if age_days > ttl_days:
            return None
        return json.loads(row[1])
    except Exception:
        return None


def _write_cache(
    conn: sqlite3.Connection,
    seed: str,
    source: str,
    data: list[str],
) -> None:
    try:
        ensure_cache_table(conn)
        conn.execute(
            "INSERT OR REPLACE INTO keyword_suggest_cache (cache_key, fetched_at, data) VALUES (?, ?, ?)",
            (
                _cache_key(seed, source),
                datetime.now(timezone.utc).isoformat(),
                json.dumps(data),
            ),
        )
        conn.commit()
    except Exception:
        pass
