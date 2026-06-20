"""GEO/AEO page-level list tools + robots AI-bot tier scoring."""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urljoin

import requests
from psycopg import Connection

from ._slice import _row_schema_types_list, cap_list, parse_limit
from .context import AuditToolContext
from .geo_tools import _base_url, _fetch_llms_txt, _has_faq_schema, _score_robots_ai_access

_HOWTO_TYPES = frozenset({"howto", "how-to"})
_HOWTO_URL_HINTS = ("/how-to", "/howto", "/guide/", "/tutorial/", "/recipes/")

# 27 AI bots across three tiers (training / search / citation).
# Citation bots retrieve and cite pages live (highest impact on visibility).
# Search bots feed AI-search indexes. Training bots harvest datasets.
_AI_BOT_TIERS: dict[str, str] = {
    # citation (9 pts weight in robots score)
    "GPTBot": "citation",
    "OAI-SearchBot": "citation",
    "ChatGPT-User": "citation",
    "ClaudeBot": "citation",
    "anthropic-ai": "citation",
    "PerplexityBot": "citation",
    "Perplexity-User": "citation",
    # search (6 pts weight)
    "Google-Extended": "search",
    "Googlebot": "search",
    "Bingbot": "search",
    "BingPreview": "search",
    "DuckDuckBot": "search",
    "Applebot": "search",
    "Applebot-Extended": "search",
    # training (3 pts weight)
    "CCBot": "training",
    "Bytespider": "training",
    "FacebookBot": "training",
    "Amazonbot": "training",
    "meta-externalagent": "training",
    "meta-externalfetcher": "training",
    "Diffbot": "training",
    "ImagesiftBot": "training",
    "omgili": "training",
    "omgilibot": "training",
    "Timpibot": "training",
    "DataForSeoBot": "training",
    "PiplBot": "training",
}

# Flat tuple for backward compat with list_robots_blocked_ai_crawlers
_AI_CRAWLER_AGENTS = tuple(_AI_BOT_TIERS.keys())


def _parse_robots_txt(domain: str) -> str:
    if not domain:
        return ""
    url = urljoin(_base_url(domain) + "/", "robots.txt")
    try:
        resp = requests.get(url, timeout=8, headers={"User-Agent": "SiteAudit/1.0"})
        if resp.status_code == 200:
            return resp.text
    except requests.RequestException:
        return ""
    return ""


def _parse_robots_access(robots_text: str) -> dict[str, str]:
    """Return per-agent access map: agent_lower -> 'blocked' | 'allowed' | 'default'.

    Handles Allow: and Disallow: with path-specific rules.
    A bot is 'blocked' only if Disallow: / with no overriding Allow: / rule.
    """
    access: dict[str, str] = {}
    sections: list[tuple[list[str], list[str], list[str]]] = []
    current_agents: list[str] = []
    current_allows: list[str] = []
    current_disallows: list[str] = []

    def _flush() -> None:
        if current_agents:
            sections.append((list(current_agents), list(current_allows), list(current_disallows)))

    for raw_line in robots_text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        lower = line.lower()
        if lower.startswith("user-agent:"):
            # Flush the current block only when it already has rules.
            # If there are no rules yet, we're in a multi-agent block (shared rules)
            # and should just keep accumulating agents.
            if current_allows or current_disallows:
                _flush()
                current_agents = []
                current_allows = []
                current_disallows = []
            current_agents.append(line.split(":", 1)[1].strip())
        elif lower.startswith("allow:"):
            current_allows.append(line.split(":", 1)[1].strip())
        elif lower.startswith("disallow:"):
            current_disallows.append(line.split(":", 1)[1].strip())
    _flush()

    def _agent_access(agent: str) -> str:
        agent_l = agent.lower()
        specific: list[tuple[list[str], list[str]]] = []
        wildcard: list[tuple[list[str], list[str]]] = []
        for agents, allows, disallows in sections:
            agents_lower = [a.lower() for a in agents]
            if agent_l in agents_lower:
                specific.append((allows, disallows))
            elif "*" in agents_lower:
                wildcard.append((allows, disallows))
        # Specific rules always take precedence over wildcard
        applicable = specific if specific else wildcard
        if not applicable:
            return "default"
        for allows, disallows in applicable:
            # A bare `Disallow:` (empty value) is the canonical allow-all directive,
            # not a block; only `Disallow: /` blocks the whole site.
            root_blocked = "/" in disallows
            root_allowed = "/" in allows
            if root_blocked and not root_allowed:
                return "blocked"
        return "allowed"

    for agent in _AI_BOT_TIERS:
        access[agent.lower()] = _agent_access(agent)
    return access


def _agent_blocked(robots_text: str, agent: str) -> bool:
    """True if the agent is blocked from the entire site (Disallow: /)."""
    access = _parse_robots_access(robots_text)
    return access.get(agent.lower()) == "blocked"


def _has_howto_schema(row: dict[str, Any]) -> bool:
    types = [t.lower() for t in _row_schema_types_list(row)]
    return any(t in _HOWTO_TYPES or "howto" in t for t in types)


def _looks_like_howto_page(rec: dict[str, Any]) -> bool:
    url = str(rec.get("url") or "").lower()
    heading = str(rec.get("heading_text") or rec.get("h1") or "").lower()
    title = str(rec.get("title") or "").lower()
    if any(h in url for h in _HOWTO_URL_HINTS):
        return True
    return any(k in heading or k in title for k in ("how to", "step-by-step", "tutorial", "guide"))


def _aeo_score(rec: dict[str, Any]) -> dict[str, Any]:
    excerpt = str(rec.get("content_excerpt") or "")
    words = excerpt.split()
    lead = " ".join(words[:80])
    has_list = bool(re.search(r"^\s*[-*•]\s", excerpt, re.M)) or "<li>" in str(rec.get("html") or "").lower()
    has_definition = bool(re.search(r"\b(is|are|means|refers to)\b", lead[:400], re.I))
    try:
        wc = int(rec.get("word_count") or 0)
    except (TypeError, ValueError):
        wc = 0
    quotability = 0
    if wc >= 200:
        quotability += 25
    if has_list:
        quotability += 20
    if has_definition:
        quotability += 25
    if _has_faq_schema(rec):
        quotability += 30
    schema_types = _row_schema_types_list(rec)
    if schema_types:
        quotability += 10
    return {
        "word_count": wc,
        "has_lists": has_list,
        "has_definition_pattern": has_definition,
        "quotability_score": min(100, quotability),
        "schema_types": schema_types[:5],
    }


def _llms_urls(llms_preview: str, llms_url: str) -> set[str]:
    urls: set[str] = set()
    for line in (llms_preview or "").splitlines():
        for match in re.findall(r"https?://[^\s)>]+", line):
            urls.add(match.rstrip("/").lower())
    if llms_url:
        urls.add(llms_url.rstrip("/").lower())
    return urls


# ---------------------------------------------------------------------------
# Public tools
# ---------------------------------------------------------------------------

def get_robots_ai_access_score(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Score robots.txt AI-bot access /18 with tier breakdown."""
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    if not domain:
        return {"error": "domain unknown", "robots_score": 0}
    robots_text = _parse_robots_txt(domain)
    if not robots_text.strip():
        return {
            "domain": domain,
            "robots_score": 0,
            "missing": True,
            "note": "robots.txt not reachable",
            "provenance": "Crawl",
        }
    access_map = _parse_robots_access(robots_text)
    per_bot: list[dict[str, Any]] = []
    for agent, tier in _AI_BOT_TIERS.items():
        status = access_map.get(agent.lower(), "default")
        per_bot.append({"agent": agent, "tier": tier, "access": status})
    per_bot.sort(key=lambda x: ("citation", "search", "training").index(x["tier"]))
    result = _score_robots_ai_access(domain)
    result["domain"] = domain
    result["per_bot"] = per_bot
    result["provenance"] = "Crawl"
    return result


def list_pages_missing_howto_schema(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False, "missing": True}
    pages: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        if not _looks_like_howto_page(rec) or _has_howto_schema(rec):
            continue
        pages.append({
            "url": str(rec.get("url") or ""),
            "title": str(rec.get("title") or ""),
            "reason": "howto_heuristic_no_schema",
        })
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(pages, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "provenance": "Estimated"}


def list_pages_ai_citation_signals(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    df = scoped.load_crawl_df(conn)
    if df is None or df.empty:
        return {"pages": [], "total": 0, "truncated": False, "missing": True}
    try:
        min_score = int(args.get("min_score") or 0)
    except (TypeError, ValueError):
        min_score = 0
    scored: list[dict[str, Any]] = []
    for _, row in df.iterrows():
        rec = row.to_dict()
        if not str(rec.get("status") or "").startswith("2"):
            continue
        signals = _aeo_score(rec)
        if signals["quotability_score"] < min_score:
            continue
        scored.append({
            "url": str(rec.get("url") or ""),
            "title": str(rec.get("title") or ""),
            **signals,
        })
    scored.sort(key=lambda p: -int(p.get("quotability_score") or 0))
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(scored, limit, max_cap=50)
    return {"pages": sliced["items"], "total": sliced["total"], "truncated": sliced["truncated"], "provenance": "Estimated"}


def list_pages_missing_llms_txt_reference(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    llms = _fetch_llms_txt(domain)
    if not llms.get("found"):
        return {
            "pages": [],
            "total": 0,
            "truncated": False,
            "missing": True,
            "note": "llms.txt not found on domain",
            "domain": domain,
        }
    listed = _llms_urls(str(llms.get("preview") or ""), str(llms.get("url") or ""))
    payload = scoped.load_payload(conn)
    candidates: list[str] = []
    if payload:
        for page in payload.get("top_pages") or payload.get("links") or []:
            if isinstance(page, dict) and page.get("url"):
                candidates.append(str(page["url"]))
    df = scoped.load_crawl_df(conn)
    if df is not None and not df.empty:
        for _, row in df.iterrows():
            rec = row.to_dict()
            if str(rec.get("status") or "").startswith("2") and rec.get("url"):
                candidates.append(str(rec["url"]))
    seen: set[str] = set()
    missing: list[dict[str, Any]] = []
    for url in candidates:
        norm = url.rstrip("/").lower()
        if norm in seen:
            continue
        seen.add(norm)
        if norm in listed or url in listed:
            continue
        missing.append({"url": url, "llms_txt_url": llms.get("url")})
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(missing, limit, max_cap=50)
    return {
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "llms_txt_url": llms.get("url"),
        "provenance": "Estimated",
    }


def list_robots_blocked_ai_crawlers(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    domain = scoped.resolve_property_domain(conn)
    if not domain:
        return {"error": "domain unknown", "agents": [], "total": 0, "truncated": False}
    robots_text = _parse_robots_txt(domain)
    if not robots_text.strip():
        return {
            "domain": domain,
            "agents": [],
            "total": 0,
            "truncated": False,
            "missing": True,
            "note": "robots.txt not reachable",
        }
    access_map = _parse_robots_access(robots_text)
    blocked: list[dict[str, Any]] = []
    for agent, tier in _AI_BOT_TIERS.items():
        if access_map.get(agent.lower()) == "blocked":
            blocked.append({"agent": agent, "tier": tier, "blocked": True, "scope": "disallow: /"})
    limit = parse_limit(args.get("limit"), 20, 30)
    sliced = cap_list(blocked, limit, max_cap=30)
    return {
        "domain": domain,
        "agents": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "robots_txt_checked": True,
        "provenance": "Crawl",
    }
