"""LLM executive audit summary and traffic-weighted issue prioritization."""
from __future__ import annotations

from typing import Any


def rank_issues_by_traffic(
    categories: list[dict[str, Any]],
    gsc_pages: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    """Sort issues by GSC clicks to matching URL (descending)."""
    clicks_by_url: dict[str, float] = {}
    for row in gsc_pages or []:
        if not isinstance(row, dict):
            continue
        url = str(row.get("page") or row.get("url") or "").strip().lower()
        if not url:
            continue
        try:
            clicks_by_url[url] = float(row.get("clicks") or 0)
        except (TypeError, ValueError):
            clicks_by_url[url] = 0.0

    ranked: list[dict[str, Any]] = []
    for cat in categories or []:
        cat_name = cat.get("name") or cat.get("id") or ""
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            url = str(issue.get("url") or "").strip().lower()
            clicks = clicks_by_url.get(url, 0.0)
            ranked.append({
                **issue,
                "category": cat_name,
                "gsc_clicks": clicks,
                "traffic_weight": clicks,
            })
    ranked.sort(key=lambda x: (-x.get("traffic_weight", 0), x.get("priority", "Medium")))
    return ranked


def generate_audit_executive_summary(
    report_payload: dict[str, Any],
    cfg: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Optional LLM narrative; falls back to deterministic summary."""
    from ..llm_config import llm_is_enabled

    categories = report_payload.get("categories") or []
    gsc = (report_payload.get("google") or {}).get("gsc") or {}
    gsc_pages = gsc.get("pages") if isinstance(gsc, dict) else []
    top_issues = rank_issues_by_traffic(categories, gsc_pages)[:5]

    lines = []
    scores = [c.get("score") for c in categories if isinstance(c.get("score"), (int, float))]
    if scores:
        avg = round(sum(scores) / len(scores))
        lines.append(f"Overall audit health score: {avg}/100.")
    if top_issues:
        lines.append("Top traffic-impacting issues:")
        for i, iss in enumerate(top_issues[:3], 1):
            lines.append(f"{i}. [{iss.get('priority')}] {iss.get('message')} ({iss.get('url') or 'site-wide'})")

    fallback = "\n".join(lines) if lines else "No major issues detected in this audit run."

    source = "deterministic"
    priorities: list[str] = []
    if llm_is_enabled(cfg or {}) and _audit_summary_llm_enabled(cfg or {}):
        source = "ai_insights"
        llm_result = _generate_llm_executive_summary(report_payload, top_issues, cfg or {})
        if llm_result.get("summary"):
            fallback = str(llm_result["summary"])
            priorities = llm_result.get("priorities") or []
        else:
            lines.append("(LLM summary unavailable — using deterministic summary.)")
            fallback = "\n".join(lines)
    elif llm_is_enabled(cfg or {}):
        lines.append("(Enable audit executive summary in AI task settings for LLM narrative.)")
        fallback = "\n".join(lines)

    return {
        "ok": True,
        "source": source,
        "summary": fallback,
        "top_issues": top_issues,
        "priorities": priorities,
    }


def _audit_summary_llm_enabled(cfg: dict[str, str]) -> bool:
    v = str(cfg.get("llm_enable_audit_summary", "true")).lower()
    return v in ("true", "1", "yes")


def _generate_llm_executive_summary(
    report_payload: dict[str, Any],
    top_issues: list[dict[str, Any]],
    cfg: dict[str, str],
) -> dict[str, Any]:
    import json

    from .base import get_llm_client, parse_json_response
    from .prompts import AUDIT_EXECUTIVE_SYSTEM

    categories = report_payload.get("categories") or []
    scores = [c.get("score") for c in categories if isinstance(c.get("score"), (int, float))]
    avg = round(sum(scores) / len(scores)) if scores else None
    payload = {
        "health_score": avg,
        "category_scores": [
            {"name": c.get("name"), "score": c.get("score")}
            for c in categories[:12]
            if isinstance(c, dict)
        ],
        "top_issues": [
            {
                "priority": i.get("priority"),
                "message": i.get("message"),
                "url": i.get("url"),
                "gsc_clicks": i.get("gsc_clicks"),
            }
            for i in top_issues[:5]
        ],
        "total_urls": (report_payload.get("summary") or {}).get("total_urls"),
    }
    try:
        client = get_llm_client(cfg)
        user = json.dumps(payload, indent=2, default=str)[:10000]
        raw = client.complete_json(AUDIT_EXECUTIVE_SYSTEM, user)
        parsed = raw if isinstance(raw, dict) and raw else parse_json_response(str(raw))
        summary = str(parsed.get("summary") or "").strip()
        priorities = parsed.get("priorities") if isinstance(parsed.get("priorities"), list) else []
        return {"summary": summary, "priorities": priorities}
    except Exception:
        return {}
