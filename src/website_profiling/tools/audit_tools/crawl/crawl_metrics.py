"""Crawl aggregate metrics: asset weight and readability."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ..context import AuditToolContext


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    idx = int(round((pct / 100.0) * (len(ordered) - 1)))
    idx = max(0, min(idx, len(ordered) - 1))
    return round(ordered[idx], 1)


def get_asset_weight_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"missing": True, "note": "no crawl data"}
    js_vals: list[float] = []
    css_vals: list[float] = []
    script_vals: list[float] = []
    for _, row in df.iterrows():
        if not str(row.get("status") or "").startswith("2"):
            continue
        for col, bucket in (("total_js_bytes", js_vals), ("total_css_bytes", css_vals), ("script_count", script_vals)):
            if col not in df.columns:
                continue
            try:
                v = float(row.get(col) or 0)
            except (TypeError, ValueError):
                continue
            if v > 0:
                bucket.append(v)
    return {
        "js_bytes": {"p50": _percentile(js_vals, 50), "p95": _percentile(js_vals, 95), "count": len(js_vals)},
        "css_bytes": {"p50": _percentile(css_vals, 50), "p95": _percentile(css_vals, 95), "count": len(css_vals)},
        "script_count": {"p50": _percentile(script_vals, 50), "p95": _percentile(script_vals, 95), "count": len(script_vals)},
        "provenance": "Crawl",
    }


def get_readability_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty or "reading_level" not in df.columns:
        return {"missing": True, "note": "reading_level not in crawl data"}
    levels: list[float] = []
    buckets: dict[str, int] = {"0-6": 0, "7-9": 0, "10-12": 0, "13+": 0}
    for _, row in df.iterrows():
        if not str(row.get("status") or "").startswith("2"):
            continue
        try:
            lvl = float(row.get("reading_level") or 0)
        except (TypeError, ValueError):
            continue
        if lvl <= 0:
            continue
        levels.append(lvl)
        if lvl <= 6:
            buckets["0-6"] += 1
        elif lvl <= 9:
            buckets["7-9"] += 1
        elif lvl <= 12:
            buckets["10-12"] += 1
        else:
            buckets["13+"] += 1
    mean = round(sum(levels) / len(levels), 1) if levels else None
    median = _percentile(levels, 50) if levels else None
    return {
        "mean_reading_level": mean,
        "median_reading_level": median,
        "histogram": buckets,
        "pages_with_reading_level": len(levels),
        "provenance": "Crawl",
    }
