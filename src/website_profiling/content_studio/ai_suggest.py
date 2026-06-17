"""Content Studio analyze: SEO score + rule-based and optional LLM suggestions."""
from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from ..llm_config import load_llm_config_from_db, llm_is_enabled
from ..llm.enrich import _read_cache, _write_cache
from ..llm.prompts import PROMPT_VERSION
from .agent import run_content_studio_analyze
from .context import ContentStudioContext
from .score import score_content_draft
from .tools import run_all_content_studio_tools


def _rule_suggestions(score: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for term in score.get("terms") or []:
        if not isinstance(term, dict):
            continue
        if term.get("status") == "missing":
            items.append({
                "text": f"Work the term “{term.get('term')}” into a heading or paragraph.",
                "priority": term.get("importance") or "medium",
                "type": "term",
                "source": "rule",
            })
        elif term.get("status") == "partial":
            items.append({
                "text": f"Use the full phrase “{term.get('term')}” (related words appear but not the exact query).",
                "priority": "medium",
                "type": "term",
                "source": "rule",
            })
        elif term.get("status") == "included":
            count = int(term.get("count") or 0)
            target = int(term.get("target") or 0)
            if target and count < target and term.get("importance") == "high":
                items.append({
                    "text": f"Use “{term.get('term')}” {target - count} more time(s) ({count}/{target}) to fully cover it.",
                    "priority": "low",
                    "type": "term",
                    "source": "rule",
                })
    for check in score.get("checks") or []:
        if isinstance(check, dict) and not check.get("pass"):
            items.append({
                "text": str(check.get("hint") or "Fix an on-page check."),
                "priority": "high",
                "type": "seo",
                "source": "rule",
            })
    wc = int(score.get("word_count") or 0)
    if wc > 0 and wc < 400:
        items.append({
            "text": "Expand the body with examples, FAQs, or subsections to reach a competitive word count.",
            "priority": "medium",
            "type": "structure",
            "source": "rule",
        })
    return items[:15]


def _merge_suggestions(
    rule: list[dict[str, Any]],
    ai: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    seen: set[str] = set()
    merged: list[dict[str, Any]] = []
    for item in [*ai, *rule]:
        if not isinstance(item, dict):
            continue
        text = re.sub(r"\s+", " ", str(item.get("text") or "").strip().lower())
        if not text or text in seen:
            continue
        seen.add(text)
        merged.append({
            "text": str(item.get("text") or "").strip(),
            "priority": str(item.get("priority") or "medium"),
            "type": str(item.get("type") or "seo"),
            "source": str(item.get("source") or "ai"),
        })
    return merged[:20]


def _cfg_content_studio_ai(cfg: dict[str, str]) -> bool:
    v = str(cfg.get("llm_enable_content_studio", "true")).lower()
    return v in ("true", "1", "yes")


def analyze_content_draft(
    property_id: int | None,
    keyword: str,
    body_html: str,
    title_tag: str = "",
    meta_description: str = "",
    landing_url: str | None = None,
    *,
    use_ai: bool = False,
    refresh: bool = False,
    title: str = "",
) -> dict[str, Any]:
    """Full analyze: score + suggestions (rules always; LLM when use_ai and configured)."""
    score = score_content_draft(
        property_id,
        keyword,
        body_html,
        title_tag,
        meta_description,
        landing_url,
    )
    rule = _rule_suggestions(score)
    result: dict[str, Any] = {
        "ok": True,
        "score": score,
        "suggestions": rule,
        "summary": _default_summary(score, keyword),
        "outline": [],
        "title_ideas": [],
        "ai_used": False,
        "tools_used": [],
        "tool_events": [],
        "provenance": score.get("provenance", "Search Console + on-site heuristics"),
    }

    if not use_ai:
        result["provenance"] = f"{result['provenance']} · Rule-based tips"
        ctx = ContentStudioContext(
            property_id=property_id,
            keyword=keyword,
            body_html=body_html,
            title_tag=title_tag,
            meta_description=meta_description,
            landing_url=landing_url,
            title=title,
        )
        tool_events = run_all_content_studio_tools(ctx)
        result["tools_used"] = [e["name"] for e in tool_events]
        result["tool_events"] = tool_events
        return result

    cfg = load_llm_config_from_db()
    if not llm_is_enabled(cfg) or not _cfg_content_studio_ai(cfg):
        result["provenance"] = f"{result['provenance']} · AI off (enable in Run audit → AI settings)"
        result["ai_error"] = "AI insights disabled in settings."
        return result

    ctx = ContentStudioContext(
        property_id=property_id,
        keyword=keyword,
        body_html=body_html,
        title_tag=title_tag,
        meta_description=meta_description,
        landing_url=landing_url,
        title=title,
    )
    model = (cfg.get("llm_model") or cfg.get("llm_provider") or "unknown").strip()
    cache_payload = {
        "keyword": keyword,
        "title": title,
        "title_tag": title_tag,
        "meta_description": meta_description,
        "landing_url": landing_url,
        "grade_score": score.get("grade_score"),
        "body_hash": hashlib.sha256((body_html or "").encode()).hexdigest()[:16],
    }
    cache_key = hashlib.sha256(
        f"content_studio:v2-tools:{PROMPT_VERSION}:{model}:{json.dumps(cache_payload, sort_keys=True)}".encode()
    ).hexdigest()

    ai_block: dict[str, Any] = {}
    tool_events: list[dict[str, Any]] = []
    if not refresh:
        cached = _read_cache(cache_key)
        if isinstance(cached, dict) and cached.get("ai_block"):
            ai_block = cached["ai_block"]
            tool_events = cached.get("tool_events") if isinstance(cached.get("tool_events"), list) else []

    if not ai_block:
        agent_result = run_content_studio_analyze(ctx, cfg)
        tool_events = agent_result.get("tool_events") if isinstance(agent_result.get("tool_events"), list) else []
        result["tools_used"] = [str(e.get("name") or "") for e in tool_events if e.get("name")]
        result["tool_events"] = tool_events

        if not agent_result.get("ok"):
            result["ai_error"] = str(agent_result.get("error") or "AI analyze failed")
            result["provenance"] = f"{result['provenance']} · Rule-based tips (AI failed)"
            return result

        ai_block = agent_result.get("ai_block") if isinstance(agent_result.get("ai_block"), dict) else {}
        if ai_block:
            _write_cache(cache_key, {"ai_block": ai_block, "tool_events": tool_events})
    else:
        result["tools_used"] = [str(e.get("name") or "") for e in tool_events if e.get("name")]
        result["tool_events"] = tool_events

    if not ai_block:
        result["ai_error"] = "No structured output from analyze agent."
        result["provenance"] = f"{result['provenance']} · Rule-based tips (AI failed)"
        return result

    ai_suggestions = ai_block.get("suggestions") if isinstance(ai_block.get("suggestions"), list) else []
    for s in ai_suggestions:
        if isinstance(s, dict):
            s["source"] = "ai"

    result["suggestions"] = _merge_suggestions(rule, ai_suggestions)
    if ai_block.get("summary"):
        result["summary"] = str(ai_block["summary"])
    if isinstance(ai_block.get("outline"), list):
        result["outline"] = [str(x) for x in ai_block["outline"][:8]]
    if isinstance(ai_block.get("title_ideas"), list):
        result["title_ideas"] = [str(x) for x in ai_block["title_ideas"][:5]]
    result["ai_used"] = True
    result["provenance"] = "Tool-based AI analyze + Search Console heuristics"
    return result


def _default_summary(score: dict[str, Any], keyword: str) -> str:
    grade = score.get("grade_label") or "?"
    pts = score.get("grade_score")
    kw = (keyword or "").strip() or "your target keyword"
    missing = sum(
        1 for t in (score.get("terms") or [])
        if isinstance(t, dict) and t.get("status") == "missing"
    )
    return (
        f"Draft scores {grade} ({pts}/100) for “{kw}”. "
        f"{missing} priority term(s) still missing from the body."
    )
