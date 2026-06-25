"""Content Studio guided-draft wizard: AI-driven brief → full draft.

Powers the multi-step /write wizard (intent → content type → tone → title →
outline → draft). Every step is AI-generated through the configured LLM, with
deterministic fallbacks so the wizard degrades gracefully when the model is
unavailable, disabled, or returns malformed JSON. The final draft body is
*assembled* in Python from AI-written prose, so the HTML structure is always
valid and safe (no model-emitted markup is trusted verbatim).
"""
from __future__ import annotations

import html
import re
from typing import Any

from ..llm_client_http import complete_json, parse_json_response
from ..llm_config import load_llm_config_from_db, llm_is_enabled
from ..text_sanitize import strip_surrogates

_MAX_OPTIONS = 6
_MAX_TITLES = 6
_MAX_OUTLINE = 24
_ALLOWED_LEVELS = ("h1", "h2", "h3")

_FALLBACK_CONTENT_TYPES = [
    ("How-to guide", "Step-by-step instructions that walk the reader through a task."),
    ("Listicle", "A scannable numbered or bulleted list of items, tips, or examples."),
    ("Comparison", "Weighs two or more options against each other to aid a decision."),
    ("Explainer / overview", "Defines the topic and covers the essentials for newcomers."),
    ("FAQ", "Answers the common questions searchers ask about the topic."),
    ("Opinion / editorial", "A point-of-view piece backed by reasoning and examples."),
]

_FALLBACK_TONES = [
    ("Professional", "Polished and credible, suitable for a business audience."),
    ("Conversational", "Warm and approachable, like talking to a knowledgeable friend."),
    ("Authoritative", "Confident and expert, establishing trust and depth."),
    ("Friendly", "Casual and encouraging, easy for beginners to follow."),
    ("Informative", "Neutral and fact-forward, prioritising clarity over flair."),
    ("Persuasive", "Action-oriented, building toward a clear call to action."),
]

_JSON_SYSTEM = "You are an expert SEO content strategist. Respond with valid JSON only — no prose, no markdown fences."


def _clean(value: Any) -> str:
    return re.sub(r"\s+", " ", strip_surrogates(str(value or "")).strip())


def _content_studio_ai_on(cfg: dict[str, str]) -> bool:
    return str(cfg.get("llm_enable_content_studio", "true")).lower() in ("true", "1", "yes")


def _get_client() -> tuple[bool, dict[str, Any] | None]:
    """Return (ai_ok, error_dict)."""
    cfg = load_llm_config_from_db()
    if not llm_is_enabled(cfg) or not _content_studio_ai_on(cfg):
        return False, {"ok": False, "error": "AI is disabled. Enable it in Run audit → AI settings."}
    return True, None


def _safe_complete(_client: Any, system: str, user: str) -> dict[str, Any]:
    try:
        data = complete_json(system, user)
    except Exception:
        return {}
    if isinstance(data, dict):
        return data
    return parse_json_response(str(data))


def _options_from_pairs(pairs: list[tuple[str, str]]) -> list[dict[str, str]]:
    return [{"label": label, "description": desc} for label, desc in pairs]


def _normalize_options(raw: Any) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if isinstance(item, dict):
            label = _clean(item.get("label") or item.get("name") or item.get("title"))
            desc = _clean(item.get("description") or item.get("summary"))
        elif isinstance(item, str):
            label, desc = _clean(item), ""
        else:
            continue
        if label:
            out.append({"label": label[:120], "description": desc[:240]})
    return out


def _normalize_str_list(raw: Any) -> list[str]:
    out: list[str] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        if isinstance(item, dict):
            text = _clean(item.get("text") or item.get("title"))
        elif isinstance(item, str):
            text = _clean(item)
        else:
            continue
        if text:
            out.append(text[:160])
    return out


def _normalize_outline(raw: Any, title: str) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    if isinstance(raw, list):
        for it in raw:
            if isinstance(it, dict):
                level = str(it.get("level") or "").strip().lower()
                text = _clean(it.get("text") or it.get("title") or it.get("heading"))
            elif isinstance(it, str):
                level, text = "h2", _clean(it)
            else:
                continue
            if level not in _ALLOWED_LEVELS:
                level = "h2"
            if text:
                items.append({"level": level, "text": text[:200]})
            if len(items) >= _MAX_OUTLINE:
                break

    title_text = _clean(title) or (items[0]["text"] if items else "Untitled")
    body_items = [it for it in items if it["level"] != "h1"]
    if not body_items:
        return _fallback_outline(title_text)
    return [{"level": "h1", "text": title_text}, *body_items[: _MAX_OUTLINE - 1]]


def _fallback_intents(keyword: str) -> list[dict[str, str]]:
    kw = keyword.strip()
    return _options_from_pairs([
        (f"Learn about {kw}", f"Understand what {kw} is and why it matters."),
        (f"How to use {kw}", f"Practical, step-by-step guidance for {kw}."),
        (f"Best {kw} options", f"Compare the top {kw} choices available."),
        (f"{kw} reviews & comparisons", f"Evaluate {kw} against the alternatives."),
    ])


def _fallback_titles(keyword: str) -> list[str]:
    t = keyword.strip().title() or "Your Topic"
    return [
        f"{t}: A Complete Guide",
        f"What Is {t}? Everything You Need to Know",
        f"The Beginner's Guide to {t}",
        f"{t}: Tips, Examples, and Best Practices",
    ]


def _fallback_outline(title: str) -> list[dict[str, str]]:
    h1 = title.strip() or "Untitled"
    sections = ["Introduction", "Key concepts", "How it works", "Practical tips", "Common mistakes", "Conclusion"]
    return [{"level": "h1", "text": h1}, *({"level": "h2", "text": s} for s in sections)]


def suggest_intents(keyword: str, locale: str = "en-US") -> dict[str, Any]:
    ai_ok, err = _get_client()
    if err:
        return err
    kw = (keyword or "").strip()
    if not kw:
        return {"ok": False, "error": "keyword required"}
    user = (
        f'For the search keyword "{kw}" (locale {locale}), list up to {_MAX_OPTIONS} distinct '
        "search intents a reader might have. Return JSON: "
        '{"intents":[{"label":"short intent label","description":"one sentence"}]}'
    )
    data = _safe_complete(ai_ok, _JSON_SYSTEM, user)
    options = _normalize_options(data.get("intents")) or _fallback_intents(kw)
    return {"ok": True, "options": options[:_MAX_OPTIONS]}


def suggest_content_types(keyword: str, intent: str) -> dict[str, Any]:
    ai_ok, err = _get_client()
    if err:
        return err
    user = (
        f'A writer is creating content for the keyword "{keyword.strip()}" with the intent '
        f'"{intent.strip()}". Recommend up to {_MAX_OPTIONS} content types that best serve this, '
        'best first. Return JSON: {"content_types":[{"label":"type","description":"why it fits"}]}'
    )
    data = _safe_complete(ai_ok, _JSON_SYSTEM, user)
    options = _normalize_options(data.get("content_types")) or _options_from_pairs(_FALLBACK_CONTENT_TYPES)
    return {"ok": True, "options": options[:_MAX_OPTIONS]}


def suggest_tones(keyword: str, intent: str, content_type: str) -> dict[str, Any]:
    ai_ok, err = _get_client()
    if err:
        return err
    user = (
        f'For a "{content_type.strip()}" about "{keyword.strip()}" (intent: "{intent.strip()}"), '
        f"recommend up to {_MAX_OPTIONS} writing tones, best first. "
        'Return JSON: {"tones":[{"label":"tone","description":"when to use it"}]}'
    )
    data = _safe_complete(ai_ok, _JSON_SYSTEM, user)
    options = _normalize_options(data.get("tones")) or _options_from_pairs(_FALLBACK_TONES)
    return {"ok": True, "options": options[:_MAX_OPTIONS]}


def suggest_titles(keyword: str, intent: str, content_type: str, tone: str) -> dict[str, Any]:
    ai_ok, err = _get_client()
    if err:
        return err
    kw = (keyword or "").strip()
    user = (
        f'Write up to {_MAX_TITLES} compelling, SEO-friendly article titles for the keyword "{kw}". '
        f'Content type: "{content_type.strip()}". Intent: "{intent.strip()}". Tone: "{tone.strip()}". '
        "Keep each under 60 characters where possible and include the keyword naturally. "
        'Return JSON: {"titles":["title one","title two"]}'
    )
    data = _safe_complete(ai_ok, _JSON_SYSTEM, user)
    titles = _normalize_str_list(data.get("titles")) or _fallback_titles(kw)
    return {"ok": True, "titles": titles[:_MAX_TITLES]}


def _fallback_questions(keyword: str) -> list[str]:
    kw = keyword.strip()
    return [
        f"What is {kw}?",
        f"How does {kw} work?",
        f"Why is {kw} important?",
        f"What are examples of {kw}?",
        f"How do you use {kw}?",
    ]


def _fallback_sources() -> list[dict[str, str]]:
    return _options_from_pairs([
        ("Wikipedia", "Background, definitions, and a neutral overview."),
        ("Official site or documentation", "Authoritative first-party specifics."),
        ("Industry publications", "Expert analysis, trends, and commentary."),
        ("Academic or research sources", "Evidence for data-backed claims."),
        ("Reputable news coverage", "Recent developments and real-world context."),
    ])


def research_panel(keyword: str, intent: str = "", title: str = "") -> dict[str, Any]:
    """People-Also-Ask style questions + suggested reference sources for a keyword."""
    ai_ok, err = _get_client()
    if err:
        return err
    kw = (keyword or "").strip()
    if not kw:
        return {"ok": False, "error": "keyword required"}
    context = f' The article is "{title.strip()}" (intent "{intent.strip()}").' if (title or intent).strip() else ""
    user = (
        f'For the search keyword "{kw}", help an author research the topic.{context} Return JSON with: '
        '"questions" = up to 8 "People Also Ask" style questions real searchers ask; '
        '"sources" = up to 6 authoritative reference types to cite, each '
        '{"label":"source name or type","description":"what to cite it for"}. '
        'Return JSON: {"questions":["..."],"sources":[{"label":"...","description":"..."}]}'
    )
    data = _safe_complete(ai_ok, _JSON_SYSTEM, user)
    questions = _normalize_str_list(data.get("questions")) or _fallback_questions(kw)
    sources = _normalize_options(data.get("sources")) or _fallback_sources()
    return {"ok": True, "questions": questions[:8], "sources": sources[:6]}


def suggest_outline(keyword: str, intent: str, content_type: str, tone: str, title: str) -> dict[str, Any]:
    ai_ok, err = _get_client()
    if err:
        return err
    user = (
        f'Create a heading outline for an article titled "{title.strip()}" '
        f'(keyword "{keyword.strip()}", {content_type.strip()}, intent "{intent.strip()}", tone "{tone.strip()}"). '
        "Use h2 for main sections and h3 for sub-points. Do not include the title as a heading. "
        'Return JSON: {"outline":[{"level":"h2","text":"Section heading"},{"level":"h3","text":"Sub-point"}]}'
    )
    data = _safe_complete(ai_ok, _JSON_SYSTEM, user)
    outline = _normalize_outline(data.get("outline"), title)
    return {"ok": True, "outline": outline}


def _assemble_body(h1_text: str, headings: list[dict[str, str]], sections: Any) -> str:
    section_list = sections if isinstance(sections, list) else []
    parts = [f"<h1>{html.escape(h1_text)}</h1>"]
    for i, heading in enumerate(headings):
        prose = ""
        if i < len(section_list):
            raw = section_list[i]
            prose = _clean(raw.get("text") if isinstance(raw, dict) else raw)
        if not prose:
            prose = f"Add details about {heading['text'].lower()} here."
        parts.append(f"<{heading['level']}>{html.escape(heading['text'])}</{heading['level']}>")
        parts.append(f"<p>{html.escape(prose)}</p>")
    return "\n".join(parts)


def generate_draft(
    keyword: str,
    intent: str,
    content_type: str,
    tone: str,
    title: str,
    outline: list[dict[str, Any]],
) -> dict[str, Any]:
    ai_ok, err = _get_client()
    if err:
        return err

    normalized = _normalize_outline(outline, title)
    h1_text = next((it["text"] for it in normalized if it["level"] == "h1"), title.strip() or keyword.strip())
    headings = [it for it in normalized if it["level"] != "h1"]
    headings_text = "\n".join(f"{it['level']}: {it['text']}" for it in headings)

    user = (
        f'Write the body of a "{content_type.strip()}" titled "{h1_text}" for the keyword '
        f'"{keyword.strip()}" (intent "{intent.strip()}", tone "{tone.strip()}"). '
        f"Write 2-4 sentences of plain-text prose for each heading below, in order:\n{headings_text}\n\n"
        'Return JSON: {"title_tag":"SEO title under 60 chars","meta_description":"under 160 chars",'
        '"sections":["prose for heading 1","prose for heading 2", ...]} '
        "with one sections entry per heading, in the same order."
    )
    data = _safe_complete(ai_ok, _JSON_SYSTEM, user)

    title_tag = (_clean(data.get("title_tag")) or h1_text)[:70]
    meta = (_clean(data.get("meta_description")) or f"{h1_text}. Learn about {keyword.strip()}.")[:170]
    body_html = _assemble_body(h1_text, headings, data.get("sections"))
    return {
        "ok": True,
        "title_tag": title_tag,
        "meta_description": meta,
        "body_html": body_html,
        "outline": normalized,
    }


def run_wizard_step(step: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Dispatch a single wizard step. ``payload`` carries prior selections."""
    p = payload or {}
    if step == "intents":
        return suggest_intents(str(p.get("keyword") or ""), str(p.get("locale") or "en-US"))
    if step == "content_types":
        return suggest_content_types(str(p.get("keyword") or ""), str(p.get("intent") or ""))
    if step == "tones":
        return suggest_tones(
            str(p.get("keyword") or ""),
            str(p.get("intent") or ""),
            str(p.get("contentType") or ""),
        )
    if step == "titles":
        return suggest_titles(
            str(p.get("keyword") or ""),
            str(p.get("intent") or ""),
            str(p.get("contentType") or ""),
            str(p.get("tone") or ""),
        )
    if step == "research":
        return research_panel(
            str(p.get("keyword") or ""),
            str(p.get("intent") or ""),
            str(p.get("title") or ""),
        )
    if step == "outline":
        return suggest_outline(
            str(p.get("keyword") or ""),
            str(p.get("intent") or ""),
            str(p.get("contentType") or ""),
            str(p.get("tone") or ""),
            str(p.get("title") or ""),
        )
    if step == "draft":
        return generate_draft(
            str(p.get("keyword") or ""),
            str(p.get("intent") or ""),
            str(p.get("contentType") or ""),
            str(p.get("tone") or ""),
            str(p.get("title") or ""),
            p.get("outline") if isinstance(p.get("outline"), list) else [],
        )
    return {"ok": False, "error": f"unknown step: {step}"}
