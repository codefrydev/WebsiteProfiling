"""Summarize rich link_edges for reports and tools."""
from __future__ import annotations

from collections import Counter
from typing import Any


def summarize_link_rel(edges: list[dict[str, Any]]) -> dict[str, Any]:
    internal = [e for e in edges if str(e.get("link_type") or "") == "internal"]
    return {
        "total_edges": len(edges),
        "internal_edges": len(internal),
        "nofollow_internal": sum(1 for e in internal if e.get("is_nofollow")),
        "sponsored_internal": sum(1 for e in internal if e.get("is_sponsored")),
        "ugc_internal": sum(1 for e in internal if e.get("is_ugc")),
        "external_edges": len(edges) - len(internal),
    }


def build_inlink_anchor_matrix(edges: list[dict[str, Any]], *, limit: int = 500) -> list[dict[str, Any]]:
    """Aggregate inlink anchor text counts per target URL, including dominant position."""
    buckets: dict[tuple[str, str], Counter] = {}
    for e in edges:
        if str(e.get("link_type") or "") != "internal":
            continue
        target = str(e.get("to_url") or "").rstrip("/")
        anchor = str(e.get("anchor_text") or "").strip() or "(empty)"
        source = str(e.get("from_url") or "").rstrip("/")
        if not target or not source:
            continue
        key = (target, anchor)
        if key not in buckets:
            buckets[key] = Counter()
        buckets[key][str(e.get("position") or "content")] += 1
    rows = []
    for (t, a), pos_counter in buckets.items():
        total = sum(pos_counter.values())
        top_pos = pos_counter.most_common(1)[0][0] if pos_counter else "content"
        rows.append({"target_url": t, "anchor_text": a, "inlink_count": total, "top_position": top_pos})
    rows.sort(key=lambda r: (-r["inlink_count"], r["target_url"]))
    return rows[: max(1, limit)]
