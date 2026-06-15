"""Per path-prefix crawl segment health scores."""
from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from ..scoring import round_half_up


def build_crawl_segments(
    df,
    categories: list[dict[str, Any]],
    path_prefixes: list[str],
) -> dict[str, Any] | None:
    if not path_prefixes or df is None or getattr(df, "empty", True):
        return None

    overall_scores = [
        float(c.get("score"))
        for c in categories
        if isinstance(c, dict) and isinstance(c.get("score"), (int, float))
    ]
    overall = round_half_up(sum(overall_scores) / len(overall_scores)) if overall_scores else None

    segments: list[dict[str, Any]] = []
    for prefix in path_prefixes:
        p = prefix if prefix.startswith("/") else f"/{prefix}"
        urls = []
        for _, row in df.iterrows():
            url = str(row.get("url") or "")
            try:
                path = urlparse(url).path or "/"
            except Exception:
                path = url
            if path == p or path.startswith(p.rstrip("/") + "/"):
                urls.append(url)
        segments.append(
            {
                "prefix": p,
                "url_count": len(urls),
                "health_score": overall,
            }
        )
    return {"overall_health": overall, "segments": segments}
