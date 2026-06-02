"""
Google Suggest / Autocomplete expansion (free, no auth).

Endpoints:
  web:     https://suggestqueries.google.com/complete/search?client=firefox&q=SEED&hl=LANG&gl=COUNTRY
  youtube: same + &ds=yt

Also performs question-prefixed expansion (who/what/why/when/where/how/can/should/vs)
to surface People-Also-Ask-style queries without SERP scraping.

Caches results in keyword_suggest_cache table (TTL-based).
Uses ThreadPoolExecutor for concurrency (default 4 workers).
"""
from __future__ import annotations

import json
import random
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any

import requests
from psycopg import Connection
from psycopg.types.json import Json

from ...db.storage import _parse_json_field

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
    cache_conn: Connection | None = None,
    cache_ttl_days: int = 7,
) -> dict[str, dict[str, list[str]]]:
    """
    Expand a list of seed keywords using Google Suggest.
    Returns { seed: { "web": [...], "youtube": [...], "questions": [...] } }
    Uses concurrent requests and PostgreSQL cache (keyword_suggest_cache).
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

    pending_cache: list[tuple[str, str, list[str]]] = []
    with ThreadPoolExecutor(max_workers=max_workers) as pool:
        futures = {pool.submit(_fetch_one, task): task for task in tasks_to_fetch}
        for future in as_completed(futures):
            try:
                seed, source, suggestions = future.result()
                if seed in result:
                    result[seed][source] = suggestions
                    if cache_conn is not None:
                        pending_cache.append((seed, source, suggestions))
            except Exception:
                pass

    if cache_conn is not None and pending_cache:
        flush_suggest_cache(cache_conn, pending_cache)

    return result


# ─── Cache helpers ────────────────────────────────────────────────────────────


def _cache_key(seed: str, source: str) -> str:
    return f"{source}:{seed}"


def _read_cache(
    conn: Connection,
    seed: str,
    source: str,
    ttl_days: int = 7,
) -> list[str] | None:
    try:
        cur = conn.execute(
            "SELECT fetched_at, data FROM keyword_suggest_cache WHERE cache_key = %s",
            (_cache_key(seed, source),),
        )
        row = cur.fetchone()
        if row is None:
            return None
        fetched_raw = row["fetched_at"]
        if hasattr(fetched_raw, "isoformat"):
            fetched_at = fetched_raw if fetched_raw.tzinfo else fetched_raw.replace(tzinfo=timezone.utc)
        else:
            fetched_at = datetime.fromisoformat(str(fetched_raw).replace("Z", "+00:00"))
        age_days = (datetime.now(timezone.utc) - fetched_at).total_seconds() / 86400
        if age_days > ttl_days:
            return None
        data = _parse_json_field(row["data"])
        return data if isinstance(data, list) else json.loads(data) if isinstance(data, str) else None
    except Exception:
        return None


def flush_suggest_cache(
    conn: Connection,
    entries: list[tuple[str, str, list[str]]],
) -> None:
    """Bulk-write suggest cache rows (main thread only — safe with one connection)."""
    if not entries:
        return
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        (_cache_key(seed, source), now, Json(data))
        for seed, source, data in entries
    ]
    try:
        with conn.cursor() as cur:
            for i in range(0, len(rows), 500):
                cur.executemany(
                    """INSERT INTO keyword_suggest_cache (cache_key, fetched_at, data)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (cache_key) DO UPDATE SET fetched_at = EXCLUDED.fetched_at, data = EXCLUDED.data""",
                    rows[i : i + 500],
                )
        conn.commit()
    except Exception:
        pass
