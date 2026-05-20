"""
Google Trends via pytrends (optional, unofficial library).

IMPORTANT: pytrends is unofficial, frequently rate-limited, and can return empty data.
This module returns trend DIRECTION (up/down/flat) only -- NOT volume.
Every call is wrapped in try/except; failure returns {} and never blocks the pipeline.

Usage:
    from .trends import fetch_trend_direction
    directions = fetch_trend_direction(["seo audit", "site audit"])
    # {"seo audit": "up", "site audit": "flat"}

Requires: pip install pytrends>=4.9,<5
"""
from __future__ import annotations

import time
from typing import Any

INSTALL_HINT = "pip install 'pytrends>=4.9,<5'"
MAX_KEYWORDS_PER_RUN = 50
BATCH_SIZE = 5
SLEEP_BETWEEN_BATCHES = 10.0


def _slope(series: list[int]) -> str:
    """Classify trend direction from a time-series of interest values."""
    if not series or len(series) < 4:
        return "flat"
    # Compare last quarter vs first quarter
    mid = len(series) // 2
    first_half = sum(series[:mid]) / max(mid, 1)
    second_half = sum(series[mid:]) / max(len(series) - mid, 1)
    diff = second_half - first_half
    if diff > 8:
        return "up"
    if diff < -8:
        return "down"
    return "flat"


def fetch_trend_direction(
    keywords: list[str],
    timeframe: str = "today 3-m",
    geo: str = "",
) -> dict[str, str | None]:
    """
    Returns {keyword: "up" | "down" | "flat" | None}.
    None means pytrends returned no data for that keyword.
    Never raises; returns {} on import error or complete failure.
    """
    if not keywords:
        return {}

    try:
        from pytrends.request import TrendReq
    except ImportError:
        return {}

    # Cap to avoid long runs
    keywords = keywords[:MAX_KEYWORDS_PER_RUN]
    result: dict[str, str | None] = {}

    batches = [
        keywords[i : i + BATCH_SIZE] for i in range(0, len(keywords), BATCH_SIZE)
    ]

    for i, batch in enumerate(batches):
        if i > 0:
            time.sleep(SLEEP_BETWEEN_BATCHES)
        try:
            pt = TrendReq(hl="en-US", tz=360, timeout=(10, 25))
            pt.build_payload(batch, cat=0, timeframe=timeframe, geo=geo)
            df = pt.interest_over_time()
            if df is None or df.empty:
                for kw in batch:
                    result[kw] = None
                continue
            for kw in batch:
                if kw in df.columns:
                    series = df[kw].tolist()
                    result[kw] = _slope(series)
                else:
                    result[kw] = None
        except Exception:
            for kw in batch:
                result.setdefault(kw, None)

    return result
