"""LLM-generated fix suggestions for audit issues."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from ..llm_config import llm_is_enabled
from .base import get_llm_client, parse_json_response
from .enrich import _read_cache, _write_cache
from .prompts import ISSUE_FIX_SYSTEM, PROMPT_VERSION


def _issue_fix_enabled(cfg: dict[str, str]) -> bool:
    v = str(cfg.get("llm_enable_issue_fixes", "true")).lower()
    return v in ("true", "1", "yes")


def generate_issue_fix_suggestion(
    issue: dict[str, Any],
    *,
    cfg: dict[str, str] | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    from ..llm_config import load_llm_config_from_db

    cfg = cfg or load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        return {"ok": False, "error": "AI insights are disabled."}
    if not _issue_fix_enabled(cfg):
        return {"ok": False, "error": "Issue fix suggestions are disabled in AI task settings."}

    message = str(issue.get("message") or "").strip()
    if not message:
        return {"ok": False, "error": "Issue message required."}

    payload = {
        "message": message,
        "url": issue.get("url"),
        "priority": issue.get("priority"),
        "category": issue.get("category"),
        "existing_recommendation": issue.get("recommendation"),
        "type": issue.get("type") or issue.get("finding_type"),
    }
    model = (cfg.get("llm_model") or cfg.get("llm_provider") or "unknown").strip()
    cache_key = hashlib.sha256(
        f"issue_fix:{PROMPT_VERSION}:{model}:{json.dumps(payload, sort_keys=True)}".encode()
    ).hexdigest()

    if not refresh:
        cached = _read_cache(cache_key)
        if cached:
            return {"ok": True, "cached": True, "fix": cached, "provenance": "AI insights"}

    try:
        client = get_llm_client(cfg)
        user = json.dumps(payload, indent=2, default=str)[:8000]
        raw = client.complete_json(ISSUE_FIX_SYSTEM, user)
        fix = raw if isinstance(raw, dict) and raw else parse_json_response(str(raw))
        if not fix:
            fix = {"fix": "Review the issue on the affected URL and apply standard SEO remediation."}
        _write_cache(cache_key, fix)
        return {"ok": True, "cached": False, "fix": fix, "provenance": "AI insights"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def enrich_top_issues_with_llm(
    categories: list[dict[str, Any]],
    cfg: dict[str, str] | None,
    *,
    gsc_pages: list[dict[str, Any]] | None = None,
    limit: int = 8,
) -> None:
    """Attach llm_recommendation to top traffic-weighted issues in-place."""
    from .audit_summary import rank_issues_by_traffic

    if not cfg or not llm_is_enabled(cfg) or not _issue_fix_enabled(cfg):
        return

    ranked = rank_issues_by_traffic(categories, gsc_pages)[:limit]
    if not ranked:
        return

    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for cat in categories or []:
        cat_name = str(cat.get("name") or cat.get("id") or "")
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
