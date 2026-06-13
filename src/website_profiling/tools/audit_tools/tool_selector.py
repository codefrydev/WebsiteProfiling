"""Dynamic tool selection for chat agent (Cursor-style subset loading)."""
from __future__ import annotations

import os
import re
from typing import Any

from .tool_domains import TIER_0_TOOLS
from .registry import tier0_tool_names, tool_meta, tool_names_for_domain


DOMAIN_KEYWORDS: dict[str, tuple[str, ...]] = {
    "issues": ("issue", "issues", "critical issues", "fix", "priority", "roadmap", "impact"),
    "crawl": ("crawl", "404", "500", "redirect", "status code", "orphan", "soft 404", "robots"),
    "onpage": ("title tag", "meta description", "h1", "canonical", "noindex", "on-page", "onpage"),
    "google": ("gsc", "search console", "ga4", "analytics", "clicks", "impressions", "queries"),
    "insight": ("opportunity", "engagement", "landing page", "blended", "traffic health", "diagnosis"),
    "keywords": ("keyword", "striking", "cannibal", "brand", "intent"),
    "performance": ("lighthouse", "cwv", "core web vitals", "slow page", "crux", "page speed"),
    "links": ("broken link", "internal link", "inlink", "outlink", "anchor text", "pagerank"),
    "backlinks": ("backlink", "referring domain", "gsc links", "moz", "majestic"),
    "drift": ("compare", "baseline", "delta", "history", "trend", "drift"),
    "export": ("export", "pdf", "csv", "download"),
    "images": ("image", "alt text", "lazy load", "webp", "lcp image"),
    "geo": ("geo", "aeo", "llms.txt", "faq schema", "eeat"),
    "accessibility": ("axe", "accessibility", "a11y", "mixed content"),
    "security": ("security", "tls", "hsts", "ssl"),
    "indexation": ("indexation", "sitemap", "hreflang", "indexed"),
    "content": ("duplicate content", "thin content", "word count", "readability"),
    "ops": ("access log", "log analysis", "log upload", "crawl run", "integration status", "5xx", "googlebot"),
    "portfolio": ("overview", "health score", "category scores", "executive", "portfolio", "audit summary"),
    "ctr": ("ctr", "snippet", "title meta ctr"),
}

# High-value tools referenced in the chat system prompt playbooks — pinned when domain matches.
PLAYBOOK_ANCHORS: dict[str, tuple[str, ...]] = {
    "images": ("get_image_audit_summary",),
    "export": ("export_audit_report", "export_list_as_csv"),
    "issues": ("get_critical_issues", "get_issue_priority_breakdown", "list_issues"),
    "portfolio": ("get_category_scores", "list_audit_categories"),
    "performance": ("get_lighthouse_summary", "list_pages_slow_response", "list_lighthouse_failure_lcp"),
    "drift": ("compare_reports", "compare_issue_deltas", "list_compare_traffic_losers"),
    "google": ("get_gsc_top_queries", "get_ga4_page_metrics", "list_gsc_decaying_queries", "list_gsc_decaying_pages"),
    "keywords": ("get_striking_distance_keywords", "get_keyword_cannibalisation", "list_keyword_rank_declines"),
    "indexation": ("list_hreflang_issue_pages", "list_indexation_gaps"),
    "backlinks": ("list_referring_domains", "list_backlinks_by_anchor_text"),
    "ops": ("list_log_paths_by_hits", "list_log_5xx_paths"),
}


def chat_tool_mode() -> str:
    return (os.environ.get("CHAT_TOOL_MODE") or "dynamic").strip().lower()


def chat_tool_max() -> int:
    floor = len(TIER_0_TOOLS) + 1
    try:
        return max(floor, min(int(os.environ.get("CHAT_TOOL_MAX") or 45), 120))
    except (TypeError, ValueError):
        return max(floor, 45)


def chat_tool_search_cap() -> int:
    """Soft cap after search/domain-agent expansion (Tier 0 + pinned results)."""
    return min(chat_tool_max() + 15, 75)


def _keyword_in_text(keyword: str, text: str) -> bool:
    if " " in keyword:
        return keyword in text
    return re.search(rf"\b{re.escape(keyword)}\b", text) is not None


def _score_domains(text: str) -> list[tuple[int, str]]:
    lower = text.lower()
    scores: list[tuple[int, str]] = []
    for domain, keywords in DOMAIN_KEYWORDS.items():
        score = sum(3 if _keyword_in_text(kw, lower) else 0 for kw in keywords)
        if score > 0:
            scores.append((score, domain))
    scores.sort(key=lambda x: (-x[0], x[1]))
    return scores


def apply_tool_cap(
    selected: set[str],
    cap: int,
    *,
    pinned: set[str] | None = None,
    max_pinned: int = 12,
) -> set[str]:
    """Trim tool set while preserving Tier 0 and optionally pinned names."""
    pinned = pinned or set()
    tier0 = set(TIER_0_TOOLS) & selected
    pinned_keep = sorted(pinned & selected)[: max(0, max_pinned)]
    must_keep = tier0 | set(pinned_keep)
    if len(selected) <= cap:
        return selected
    rest = sorted(selected - must_keep)
    room = max(0, cap - len(must_keep))
    return must_keep | set(rest[:room])


def select_tools_for_turn(
    user_message: str,
    history: list[dict[str, Any]] | None = None,
    *,
    max_tools: int | None = None,
    extra_names: set[str] | None = None,
) -> set[str]:
    """Return tool names to expose to the LLM this turn (Tier 0 + relevant Tier 1)."""
    if chat_tool_mode() == "full":
        from .registry import tool_handler_names
        return tool_handler_names()

    cap = max_tools if max_tools is not None else chat_tool_max()
    selected: set[str] = set(tier0_tool_names())
    if extra_names:
        selected |= extra_names

    texts = [user_message or ""]
    if history:
        for msg in reversed(history):
            if msg.get("role") == "user":
                prior = str(msg.get("content") or "")
                if prior and prior != (user_message or ""):
                    texts.append(prior)
                break
    combined = " ".join(texts)
    domain_scores = _score_domains(combined)
    scored_domains = [domain for _, domain in domain_scores[:4]]

    meta = tool_meta()
    if not domain_scores:
        for fallback in ("portfolio", "issues", "insight"):
            selected.update(tool_names_for_domain(fallback))
    else:
        for domain in scored_domains:
            selected.update(tool_names_for_domain(domain))
            for anchor in PLAYBOOK_ANCHORS.get(domain, ()):
                if anchor in meta:
                    selected.add(anchor)

    selected = apply_tool_cap(selected, cap)
    selected = {n for n in selected if n in meta or n in tier0_tool_names()}
    return selected


def compact_tool_list(names: set[str]) -> str:
    lines = sorted(names)
    return "\n".join(f"- {n}" for n in lines)
