"""Per path-prefix / regex crawl segment health scores."""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

import pandas as pd

from ..scoring import round_half_up

# Unambiguous regex metacharacters that distinguish a regex from a plain path prefix.
# Avoids false-positive on e.g. /api/v1.0 (single dot without quantifier is kept literal).
_REGEX_INDICATOR = re.compile(r"\.\*|\.\+|\\[dwWDSBbAZ]|\[|\(|\{|\$|\|")


def _is_regex(pattern: str) -> bool:
    """Return True when *pattern* contains unambiguous regex metacharacters."""
    return bool(_REGEX_INDICATOR.search(pattern))


def _matches_path(path: str, pattern: str, is_rx: bool, compiled: Any) -> bool:
    """Return True if *path* matches *pattern* (regex search or prefix check)."""
    if is_rx:
        return bool(compiled.search(path))
    # Literal prefix: exact match or path starts with prefix + "/"
    return path == pattern or path.startswith(pattern.rstrip("/") + "/")


def _segment_health(seg_df: pd.DataFrame) -> int:
    """Lightweight health score computed from the segment's URL subset.

    Uses only columns that are always present in a crawl DataFrame.  Deductions:
    - up to 30 pts for non-2xx status codes
    - up to 20 pts for missing page titles
    - up to 10 pts for missing meta descriptions
    - up to 10 pts for missing viewport tags
    Returns a value in [0, 100].
    """
    n = len(seg_df)
    if n == 0:
        return 0
    score = 100

    if "status" in seg_df.columns:
        def _is_success(s: Any) -> bool:
            return bool(s) and str(s).startswith("2")
        ok = seg_df["status"].apply(_is_success).sum()
        error_rate = 1.0 - ok / n
        if error_rate > 0:
            score -= round_half_up(30 * error_rate)

    if "title" in seg_df.columns:
        missing = seg_df["title"].apply(lambda t: not t or str(t).strip() == "").sum()
        missing_rate = missing / n
        if missing_rate > 0.1:
            score -= round_half_up(20 * missing_rate)

    if "description" in seg_df.columns:
        missing = seg_df["description"].apply(lambda d: not d or str(d).strip() == "").sum()
        missing_rate = missing / n
        if missing_rate > 0.1:
            score -= round_half_up(10 * missing_rate)

    if "viewport_present" in seg_df.columns:
        no_vp = (~seg_df["viewport_present"].astype(bool)).sum()
        no_vp_rate = no_vp / n
        if no_vp_rate > 0.1:
            score -= round_half_up(10 * no_vp_rate)

    return max(0, score)


def build_crawl_segments(
    df: Any,
    categories: list[dict[str, Any]],
    path_prefixes: list[str],
) -> dict[str, Any] | None:
    """Build per-segment health data.

    Each entry in *path_prefixes* may be a plain path prefix ("/blog") or a
    regex pattern ("/blog/.*", r"/api/v\\d+").  Regex patterns are detected
    automatically by the presence of unambiguous metacharacters.

    Health scores are computed from the segment's own URL subset rather than
    inheriting the site-wide average.
    """
    if not path_prefixes or df is None or getattr(df, "empty", True):
        return None

    # Site-wide overall health (kept for backward compatibility)
    overall_scores = [
        float(c.get("score"))
        for c in categories
        if isinstance(c, dict) and isinstance(c.get("score"), (int, float))
    ]
    overall = round_half_up(sum(overall_scores) / len(overall_scores)) if overall_scores else None

    # Pre-compile patterns once
    compiled_patterns: list[tuple[str, bool, Any]] = []
    for raw in path_prefixes:
        p = raw if raw.startswith("/") else f"/{raw}"
        is_rx = _is_regex(p)
        try:
            compiled: Any = re.compile(p) if is_rx else p
        except re.error:
            is_rx = False
            compiled = p
        compiled_patterns.append((p, is_rx, compiled))

    segments: list[dict[str, Any]] = []
    for prefix, is_rx, compiled in compiled_patterns:
        matching_rows = []
        for _, row in df.iterrows():
            url = str(row.get("url") or "")
            try:
                path = urlparse(url).path or "/"
            except Exception:
                path = url
            if _matches_path(path, prefix, is_rx, compiled):
                matching_rows.append(row.to_dict() if hasattr(row, "to_dict") else dict(row))

        seg_df = pd.DataFrame(matching_rows) if matching_rows else pd.DataFrame()
        health: int | None = _segment_health(seg_df) if not seg_df.empty else 0

        segments.append(
            {
                "prefix": prefix,
                "url_count": len(matching_rows),
                "health_score": health,
                "pattern_type": "regex" if is_rx else "prefix",
            }
        )

    return {"overall_health": overall, "segments": segments}
