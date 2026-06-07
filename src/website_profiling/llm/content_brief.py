"""LLM-assisted content brief from keyword cluster (labeled AI insights)."""
from __future__ import annotations

from typing import Any


def generate_content_brief(
    keyword: str,
    cluster_rows: list[dict[str, Any]],
    gaps: list[str] | None = None,
    *,
    use_llm: bool = False,
) -> dict[str, Any]:
    impressions = sum(int(r.get("gsc_impressions") or 0) for r in cluster_rows)
    top_url = ""
    if cluster_rows:
        top = max(cluster_rows, key=lambda r: int(r.get("gsc_clicks") or 0))
        top_url = str(top.get("gsc_url") or "")
    bullets = [
        f"Target query: {keyword}",
        f"Cluster size: {len(cluster_rows)} queries/pages",
        f"Combined impressions: {impressions:,}",
    ]
    if top_url:
        bullets.append(f"Primary landing page: {top_url}")
    if gaps:
        bullets.extend(f"Gap: {g}" for g in gaps[:5])
    summary = "\n".join(f"• {b}" for b in bullets)
    return {
        "keyword": keyword,
        "summary": summary,
        "provenance": "AI insights" if use_llm else "Estimated",
        "use_llm": use_llm,
    }
