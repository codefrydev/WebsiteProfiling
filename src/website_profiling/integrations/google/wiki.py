"""
Wikipedia REST API — Parent Topic discovery (free, no auth).

Calls the Wikipedia search API to find the canonical article for a keyword,
then returns its summary and a parent topic label derived from the first
category that looks like a subject area.

Rate limit: polite 1s delay per call; for large batches, cap at top-N keywords.
"""
from __future__ import annotations

import time
import urllib.parse
from typing import Any

import requests

WIKI_API_BASE = "https://en.wikipedia.org/api/rest_v1"
WIKI_SEARCH_API = "https://en.wikipedia.org/w/api.php"
USER_AGENT = "WebsiteProfilingKeywordEnricher/1.0 (https://github.com/codefrydev/WebsiteProfiling)"

_SKIP_CATEGORIES = {
    "articles", "pages", "stubs", "disambiguation", "redirects",
    "living people", "births", "deaths", "years",
}


def _clean_category(cat: str) -> str:
    """Strip 'Category:' prefix and lowercase."""
    cat = cat.replace("Category:", "").strip()
    return cat


def _is_useful_category(cat: str) -> bool:
    lower = cat.lower()
    for skip in _SKIP_CATEGORIES:
        if skip in lower:
            return False
    if len(cat) < 5:
        return False
    return True


def find_parent_topic(
    keyword: str,
    lang: str = "en",
    timeout: float = 8.0,
) -> dict[str, Any] | None:
    """
    Find Wikipedia parent topic for a keyword.
    Returns { "topic": str, "wiki_url": str, "extract": str } or None.
    """
    keyword = keyword.strip()
    if not keyword or len(keyword) < 3:
        return None

    try:
        # 1. Search Wikipedia for matching page title
        search_resp = requests.get(
            WIKI_SEARCH_API,
            params={
                "action": "query",
                "list": "search",
                "srsearch": keyword,
                "srnamespace": "0",
                "srlimit": "1",
                "format": "json",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        search_resp.raise_for_status()
        search_data = search_resp.json()
        results = search_data.get("query", {}).get("search", [])
        if not results:
            return None

        title = results[0]["title"]
        encoded_title = urllib.parse.quote(title.replace(" ", "_"))

        # 2. Get page summary
        summary_resp = requests.get(
            f"{WIKI_API_BASE}/page/summary/{encoded_title}",
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        if not summary_resp.ok:
            return None
        summary = summary_resp.json()

        # 3. Get categories to find parent topic
        cat_resp = requests.get(
            WIKI_SEARCH_API,
            params={
                "action": "query",
                "titles": title,
                "prop": "categories",
                "cllimit": "20",
                "clshow": "!hidden",
                "format": "json",
            },
            headers={"User-Agent": USER_AGENT},
            timeout=timeout,
        )
        cat_resp.raise_for_status()
        cat_data = cat_resp.json()
        pages = cat_data.get("query", {}).get("pages", {})
        categories: list[str] = []
        for page in pages.values():
            for cat in page.get("categories", []):
                raw = _clean_category(cat.get("title", ""))
                if raw and _is_useful_category(raw):
                    categories.append(raw)

        parent_topic = categories[0] if categories else title

        return {
            "topic": parent_topic,
            "wiki_title": title,
            "wiki_url": summary.get("content_urls", {}).get("desktop", {}).get("page", ""),
            "extract": (summary.get("extract") or "")[:200],
            "categories": categories[:5],
        }

    except Exception:
        return None


def batch_find_topics(
    keywords: list[str],
    lang: str = "en",
    delay: float = 1.0,
    max_n: int = 100,
) -> dict[str, dict[str, Any] | None]:
    """
    Batch Wikipedia lookup for up to max_n keywords.
    Returns { keyword: topic_dict_or_None }
    """
    results: dict[str, dict[str, Any] | None] = {}
    for i, kw in enumerate(keywords[:max_n]):
        if i > 0:
            time.sleep(delay)
        results[kw] = find_parent_topic(kw, lang=lang)
    return results
