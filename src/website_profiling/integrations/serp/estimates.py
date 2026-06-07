"""Optional SerpAPI overlay for keyword competition signals (Estimated)."""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any


def fetch_serp_features(keyword: str, api_key: str) -> dict[str, Any]:
    """Fetch SERP metadata from SerpAPI (Estimated competition proxy)."""
    kw = (keyword or "").strip()
    key = (api_key or "").strip()
    if not kw or not key:
        return {"ok": False, "error": "keyword and api_key required"}

    params = urllib.parse.urlencode({
        "engine": "google",
        "q": kw,
        "api_key": key,
        "num": "10",
    })
    url = f"https://serpapi.com/search.json?{params}"
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        return {"ok": False, "error": str(e)}

    organic = data.get("organic_results") or []
    features: list[str] = []
    if data.get("answer_box"):
        features.append("answer_box")
    if data.get("knowledge_graph"):
        features.append("knowledge_graph")
    if data.get("related_questions"):
        features.append("people_also_ask")
    if data.get("top_stories"):
        features.append("top_stories")

    competition = min(100, len(organic) * 8 + len(features) * 12)
    return {
        "ok": True,
        "organic_count": len(organic),
        "serp_features": features,
        "estimated_competition": competition,
        "provenance": "Estimated",
    }


def overlay_serp_estimates(
    rows: list[dict[str, Any]],
    api_key: str,
    *,
    max_keywords: int = 25,
) -> int:
    """Mutate keyword rows with serp_* fields. Returns count updated."""
    if not api_key or not rows:
        return 0
    updated = 0
    for row in rows[:max_keywords]:
        if not isinstance(row, dict):
            continue
        kw = str(row.get("keyword") or "").strip()
        if not kw or row.get("serp_estimated_competition") is not None:
            continue
        result = fetch_serp_features(kw, api_key)
        if not result.get("ok"):
            continue
        row["serp_organic_count"] = result.get("organic_count")
        row["serp_features"] = result.get("serp_features")
        row["serp_estimated_competition"] = result.get("estimated_competition")
        row["serp_provenance"] = result.get("provenance")
        updated += 1
    return updated
