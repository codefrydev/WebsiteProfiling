"""LLM-generated fix suggestions for audit issues."""
from __future__ import annotations

from typing import Any

from ..llm_config import llm_is_enabled
from .fix_suggestions import _fix_suggestion_enabled, generate_fix_suggestion


def generate_issue_fix_suggestion(
    issue: dict[str, Any],
    *,
    cfg: dict[str, str] | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    message = str(issue.get("message") or "").strip()
    if not message:
        return {"ok": False, "error": "Issue message required."}

    payload: dict[str, Any] = {
        "source": "issue",
        "message": message,
        "url": issue.get("url"),
        "refresh": refresh,
        "priority": issue.get("priority"),
        "category": issue.get("category"),
        "recommendation": issue.get("recommendation"),
        "type": issue.get("type") or issue.get("finding_type"),
    }
    return generate_fix_suggestion(payload, cfg=cfg, refresh=refresh)


def enrich_top_issues_with_llm(
    categories: list[dict[str, Any]],
    cfg: dict[str, str] | None,
    *,
    gsc_pages: list[dict[str, Any]] | None = None,
    limit: int = 8,
) -> None:
    """Attach llm_recommendation to top traffic-weighted issues in-place."""
    from .audit_summary import rank_issues_by_traffic

    if not cfg or not llm_is_enabled(cfg) or not _fix_suggestion_enabled(cfg):
        return

    ranked = rank_issues_by_traffic(categories, gsc_pages)[:limit]
    if not ranked:
        return

    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for cat in categories or []:
        for issue in cat.get("issues") or []:
            if not isinstance(issue, dict):
                continue
            key = (str(issue.get("message") or ""), str(issue.get("url") or ""))
            by_key[key] = issue

    for ranked_issue in ranked:
        key = (str(ranked_issue.get("message") or ""), str(ranked_issue.get("url") or ""))
        target = by_key.get(key)
        if not target or target.get("llm_recommendation"):
            continue
        payload = {**ranked_issue, "category": ranked_issue.get("category")}
        result = generate_issue_fix_suggestion(payload, cfg=cfg)
        if result.get("ok") and isinstance(result.get("fix"), dict):
            fix_text = str(result["fix"].get("fix") or "").strip()
            if fix_text:
                target["llm_recommendation"] = fix_text
                target["llm_fix_effort"] = result["fix"].get("effort")
