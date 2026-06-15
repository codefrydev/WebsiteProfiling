"""Deterministic tools for Content Studio analyze (tool-calling agent)."""
from __future__ import annotations

import re
from typing import Any, Callable

from bs4 import BeautifulSoup

from ..db import db_session
from ..integrations.google.keyword_store import read_latest_keyword_data
from .context import ContentStudioContext
from .score import score_content_draft

ToolHandler = Callable[[ContentStudioContext], dict[str, Any]]


def _headings_outline(html: str, *, cap: int = 12) -> list[dict[str, str]]:
    if not html or not html.strip():
        return []
    soup = BeautifulSoup(html, "html.parser")
    out: list[dict[str, str]] = []
    for tag in soup.find_all(re.compile(r"^h[1-3]$", re.I)):
        text = tag.get_text(separator=" ", strip=True)
        if text:
            out.append({"level": tag.name.lower(), "text": text[:200]})
        if len(out) >= cap:
            break
    return out


def tool_get_draft_seo_score(ctx: ContentStudioContext) -> dict[str, Any]:
    score = score_content_draft(
        ctx.property_id,
        ctx.keyword,
        ctx.body_html,
        ctx.title_tag,
        ctx.meta_description,
        ctx.landing_url,
    )
    return {
        "grade_score": score.get("grade_score"),
        "grade_label": score.get("grade_label"),
        "word_count": score.get("word_count"),
        "reading_level": score.get("reading_level"),
        "provenance": score.get("provenance"),
    }


def tool_get_term_coverage(ctx: ContentStudioContext) -> dict[str, Any]:
    score = score_content_draft(
        ctx.property_id,
        ctx.keyword,
        ctx.body_html,
        ctx.title_tag,
        ctx.meta_description,
        ctx.landing_url,
    )
    terms = score.get("terms") or []
    grouped: dict[str, list[str]] = {"missing": [], "partial": [], "included": []}
    for t in terms:
        if not isinstance(t, dict):
            continue
        status = str(t.get("status") or "missing")
        term = str(t.get("term") or "")
        if term and status in grouped:
            grouped[status].append(term)
    return {
        "target_keyword": ctx.keyword.strip(),
        "missing": grouped["missing"][:12],
        "partial": grouped["partial"][:12],
        "included": grouped["included"][:12],
        "missing_high_priority": [
            str(t.get("term") or "")
            for t in terms
            if isinstance(t, dict)
            and t.get("status") == "missing"
            and t.get("importance") == "high"
        ][:8],
    }


def tool_get_onpage_checks(ctx: ContentStudioContext) -> dict[str, Any]:
    score = score_content_draft(
        ctx.property_id,
        ctx.keyword,
        ctx.body_html,
        ctx.title_tag,
        ctx.meta_description,
        ctx.landing_url,
    )
    checks = score.get("checks") or []
    failed = [
        {"id": c.get("id"), "hint": c.get("hint")}
        for c in checks
        if isinstance(c, dict) and not c.get("pass")
    ]
    passed = [
        {"id": c.get("id"), "hint": c.get("hint")}
        for c in checks
        if isinstance(c, dict) and c.get("pass")
    ]
    return {
        "title_tag": ctx.title_tag,
        "meta_description_length": len((ctx.meta_description or "").strip()),
        "failed": failed,
        "passed": passed,
    }


def tool_get_keyword_gsc_context(ctx: ContentStudioContext) -> dict[str, Any]:
    kw = (ctx.keyword or "").strip().lower()
    if not kw:
        return {"queries": [], "note": "No target keyword set."}

    rows: list[dict[str, Any]] = []
    if ctx.property_id:
        try:
            with db_session() as conn:
                data = read_latest_keyword_data(conn, ctx.property_id)
                if isinstance(data, dict):
                    raw = data.get("rows") or []
                    rows = [r for r in raw if isinstance(r, dict)]
        except Exception:
            rows = []

    landing_norm = (ctx.landing_url or "").strip().lower().rstrip("/")
    related: list[dict[str, Any]] = []
    for row in rows:
        q = str(row.get("keyword") or "").strip()
        if not q:
            continue
        q_lower = q.lower()
        gsc_url = str(row.get("gsc_url") or "").strip().lower().rstrip("/")
        if (
            kw in q_lower
            or q_lower in kw
            or (landing_norm and landing_norm in gsc_url)
        ):
            related.append({
                "keyword": q,
                "impressions": int(row.get("gsc_impressions") or 0),
                "clicks": int(row.get("gsc_clicks") or 0),
                "position": row.get("gsc_position"),
                "url": row.get("gsc_url"),
            })

    related.sort(key=lambda r: -(int(r.get("impressions") or 0)))
    return {
        "target_keyword": ctx.keyword.strip(),
        "landing_url": ctx.landing_url,
        "queries": related[:15],
        "total_related": len(related),
    }


def tool_get_draft_structure(ctx: ContentStudioContext) -> dict[str, Any]:
    score = score_content_draft(
        ctx.property_id,
        ctx.keyword,
        ctx.body_html,
        ctx.title_tag,
        ctx.meta_description,
        ctx.landing_url,
    )
    return {
        "draft_title": ctx.title,
        "headings": _headings_outline(ctx.body_html),
        "word_count": score.get("word_count"),
        "reading_level": score.get("reading_level"),
        "body_preview": BeautifulSoup(ctx.body_html or "", "html.parser").get_text(
            separator=" ", strip=True
        )[:1200],
    }


CONTENT_STUDIO_TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "get_draft_seo_score",
        "description": "Overall SEO grade, word count, and reading level for the draft.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_term_coverage",
        "description": "GSC-related terms and whether they are missing, partial, or included in the draft.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_onpage_checks",
        "description": "Title tag, meta description, H1, and word-count checks with pass/fail hints.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_keyword_gsc_context",
        "description": "Related Search Console queries for the target keyword and landing URL.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_draft_structure",
        "description": "Heading outline, body preview, and structure metrics for the draft HTML.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
]

CONTENT_STUDIO_TOOL_HANDLERS: dict[str, ToolHandler] = {
    "get_draft_seo_score": tool_get_draft_seo_score,
    "get_term_coverage": tool_get_term_coverage,
    "get_onpage_checks": tool_get_onpage_checks,
    "get_keyword_gsc_context": tool_get_keyword_gsc_context,
    "get_draft_structure": tool_get_draft_structure,
}

REQUIRED_CONTENT_STUDIO_TOOLS = frozenset(CONTENT_STUDIO_TOOL_HANDLERS.keys())


def openai_tools_schema() -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            },
        }
        for t in CONTENT_STUDIO_TOOL_DEFINITIONS
    ]


def dispatch_content_studio_tool(name: str, ctx: ContentStudioContext) -> dict[str, Any]:
    handler = CONTENT_STUDIO_TOOL_HANDLERS.get(name)
    if handler is None:
        return {"error": f"unknown tool: {name}"}
    try:
        return handler(ctx)
    except Exception as e:
        return {"error": str(e)}


def run_all_content_studio_tools(ctx: ContentStudioContext) -> list[dict[str, Any]]:
    """Deterministic fallback: execute every analyze tool in fixed order."""
    events: list[dict[str, Any]] = []
    for name in CONTENT_STUDIO_TOOL_DEFINITIONS:
        tool_name = str(name["name"])
        events.append({
            "name": tool_name,
            "args": {},
            "result": dispatch_content_studio_tool(tool_name, ctx),
        })
    return events
