"""LLM action plan for deduplicated audit issue lists."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from ..llm_config import llm_is_enabled
from .base import get_llm_client, parse_json_response
from .enrich import _read_cache, _write_cache
from .fix_suggestions import _fix_suggestion_enabled
from .prompts import ISSUES_ACTION_PLAN_SYSTEM, PROMPT_VERSION

MAX_ISSUES = 80


def _cache_key(model: str, domain: str, issues: list[dict[str, Any]]) -> str:
    body = json.dumps({"domain": domain, "issues": issues}, sort_keys=True, default=str)
    digest = hashlib.sha256(f"issues_action_plan:{PROMPT_VERSION}:{model}:{body}".encode()).hexdigest()
    return digest


def _compact_issues(raw: list[Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in raw or []:
        if not isinstance(row, dict):
            continue
        message = str(row.get("message") or "").strip()
        if not message:
            continue
        item: dict[str, Any] = {
            "category": str(row.get("category") or ""),
            "message": message,
            "priority": str(row.get("priority") or "Medium"),
            "url_count": int(row.get("url_count") or row.get("urlCount") or 0),
            "sample_urls": [
                str(u).strip()
                for u in (row.get("sample_urls") or row.get("sampleUrls") or [])
                if str(u).strip()
            ][:5],
        }
        rec = row.get("recommendation")
        if rec:
            item["recommendation"] = str(rec)
        for src, dst in (("impact_score", "impact_score"), ("gsc_clicks", "gsc_clicks")):
            val = row.get(src) if src in row else row.get("impactScore" if src == "impact_score" else "gscClicks")
            if val is not None:
                try:
                    item[dst] = float(val)
                except (TypeError, ValueError):
                    pass
        out.append(item)
    return out[:MAX_ISSUES]


def _format_plan_markdown(data: dict[str, Any]) -> str:
    lines: list[str] = []
    summary = str(data.get("summary") or "").strip()
    if summary:
        lines.extend([summary, ""])

    quick_wins = data.get("quick_wins") or []
    if isinstance(quick_wins, list) and quick_wins:
        lines.append("### Quick wins")
        for item in quick_wins[:8]:
            text = str(item).strip()
            if text:
                lines.append(f"- {text}")
        lines.append("")

    phases = data.get("phases") or []
    if isinstance(phases, list) and phases:
        lines.append("### Phased plan")
        for phase in phases[:6]:
            if not isinstance(phase, dict):
                continue
            name = str(phase.get("name") or "Phase").strip()
            effort = str(phase.get("effort") or "").strip()
            header = f"**{name}**"
            if effort:
                header += f" (effort: {effort})"
            lines.append(header)
            actions = phase.get("actions") or []
            if isinstance(actions, list):
                for action in actions[:8]:
                    text = str(action).strip()
                    if text:
                        lines.append(f"- {text}")
            lines.append("")

    notes = str(data.get("notes") or "").strip()
    if notes:
        lines.extend(["### Notes", notes])

    return "\n".join(lines).strip()


def generate_issues_action_plan(
    payload: dict[str, Any],
    *,
    cfg: dict[str, str] | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    from ..llm_config import load_llm_config_from_db

    cfg = cfg or load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        return {"ok": False, "error": "AI insights are disabled."}
    if not _fix_suggestion_enabled(cfg):
        return {"ok": False, "error": "Issue fix suggestions are disabled in AI task settings."}

    domain = str(payload.get("domain") or "").strip()
    issues = _compact_issues(payload.get("issues") or [])
    if not domain:
        return {"ok": False, "error": "domain required."}
    if not issues:
        return {"ok": False, "error": "issues required."}

    model = (cfg.get("llm_model") or cfg.get("llm_provider") or "unknown").strip()
    cache_key = _cache_key(model, domain, issues)

    if not refresh:
        cached = _read_cache(cache_key)
        if cached:
            plan_md = _format_plan_markdown(cached)
            return {
                "ok": True,
                "cached": True,
                "plan": plan_md,
                "summary": cached.get("summary"),
                "phases": cached.get("phases"),
                "quick_wins": cached.get("quick_wins"),
                "notes": cached.get("notes"),
                "provenance": "AI insights",
            }

    user_payload = {"domain": domain, "issue_count": len(issues), "issues": issues}
    try:
        client = get_llm_client(cfg)
        user = json.dumps(user_payload, indent=2, default=str)[:12000]
        raw = client.complete_json(ISSUES_ACTION_PLAN_SYSTEM, user)
        parsed = raw if isinstance(raw, dict) and raw else parse_json_response(str(raw))
        if not isinstance(parsed, dict):
            parsed = {"summary": str(raw or "").strip() or "No plan returned."}
        _write_cache(cache_key, parsed)
        plan_md = _format_plan_markdown(parsed)
        return {
            "ok": True,
            "cached": False,
            "plan": plan_md,
            "summary": parsed.get("summary"),
            "phases": parsed.get("phases"),
            "quick_wins": parsed.get("quick_wins"),
            "notes": parsed.get("notes"),
            "provenance": "AI insights",
        }
    except Exception as e:
        return {"ok": False, "error": str(e)}
