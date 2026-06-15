"""Content Studio analyze agent — fixed tool set, structured JSON output."""
from __future__ import annotations

import json
from typing import Any

from ..llm.base import ChatResult, ToolCall, get_llm_client, parse_json_response
from ..text_sanitize import sanitize_unicode_deep, strip_surrogates
from .context import ContentStudioContext
from .tools import (
    REQUIRED_CONTENT_STUDIO_TOOLS,
    dispatch_content_studio_tool,
    openai_tools_schema,
    run_all_content_studio_tools,
)

MAX_TOOL_ROUNDS = 8

CONTENT_STUDIO_AGENT_SYSTEM = """You are an SEO content editor analyzing a draft article in Content Studio.

Workflow (strict):
1. Call EVERY analyze tool exactly once before your final answer:
   get_draft_seo_score, get_term_coverage, get_onpage_checks, get_keyword_gsc_context, get_draft_structure
2. Base suggestions ONLY on tool results. Do not invent SERP rankings, competitor data, or traffic numbers.
3. When all tools have been called, respond with valid JSON only (no markdown fences):
{
  "summary": "2-3 sentences on draft quality and top priority",
  "suggestions": [{"text": "specific actionable suggestion", "priority": "high|medium|low", "type": "term|structure|seo|readability"}],
  "outline": ["optional H2 heading ideas"],
  "title_ideas": ["optional title tag ideas"]
}
Prioritize missing high-importance terms, failed on-page checks, and clarity improvements. Keep suggestions concise and actionable."""


def _supports_native_tools(client: Any) -> bool:
    return callable(getattr(client, "chat_with_tools", None))


def _uses_ollama_tool_format(client: Any) -> bool:
    return client.__class__.__name__ == "OllamaClient"


def _react_step(client: Any, messages: list[dict[str, Any]]) -> ChatResult:
    tools_desc = "\n".join(
        f"- {t['function']['name']}: {t['function']['description']}"
        for t in openai_tools_schema()
    )
    convo = "\n".join(
        f"{m.get('role')}: {m.get('content')}"
        for m in messages
        if m.get("role") in ("user", "assistant", "system") and m.get("content")
    )
    user = (
        f"Available tools:\n{tools_desc}\n\nConversation:\n{convo}\n\n"
        'Respond with JSON only: {"action":"tool","name":"<tool_name>","args":{}} '
        'or {"action":"answer","text":"<final JSON object>"}'
    )
    data = client.complete_json(CONTENT_STUDIO_AGENT_SYSTEM, user)
    action = str(data.get("action") or "").lower()
    if action == "tool":
        return ChatResult(
            tool_calls=[ToolCall(
                id="react-0",
                name=str(data.get("name") or ""),
                arguments=data.get("args") if isinstance(data.get("args"), dict) else {},
            )],
        )
    text = str(data.get("text") or data.get("answer") or data.get("content") or "")
    if text.strip().startswith("{"):
        return ChatResult(content=text)
    return ChatResult(content=text)


def _inject_missing_tools(
    openai_messages: list[dict[str, Any]],
    ctx: ContentStudioContext,
    called: set[str],
    ollama_format: bool,
) -> None:
    for name in sorted(REQUIRED_CONTENT_STUDIO_TOOLS - called):
        result = sanitize_unicode_deep(dispatch_content_studio_tool(name, ctx))
        called.add(name)
        if ollama_format:
            openai_messages.append({
                "role": "tool",
                "tool_name": name,
                "content": json.dumps(result, default=str),
            })
        else:
            openai_messages.append({
                "role": "tool",
                "tool_call_id": f"auto-{name}",
                "content": json.dumps(result, default=str),
            })
    openai_messages.append({
        "role": "user",
        "content": (
            "All analyze tools have now run. Output your final JSON object only "
            "(summary, suggestions, outline, title_ideas)."
        ),
    })


def _parse_final_json(content: str) -> dict[str, Any]:
    text = strip_surrogates(content or "").strip()
    if not text:
        return {}
    if text.startswith("```"):
        text = text.strip("`").strip()
        if text.lower().startswith("json"):
            text = text[4:].strip()
    data = parse_json_response(text)
    return data if isinstance(data, dict) else {}


def run_content_studio_analyze(
    ctx: ContentStudioContext,
    cfg: dict[str, str],
) -> dict[str, Any]:
    """
    Run tool-calling analyze loop. Returns:
    {ok, ai_block, tool_events, error?}
    """
    try:
        client = get_llm_client(cfg)
    except ValueError as e:
        return {"ok": False, "error": str(e), "tool_events": []}

    tools = openai_tools_schema()
    ollama_format = _uses_ollama_tool_format(client)
    openai_messages: list[dict[str, Any]] = [
        {"role": "system", "content": CONTENT_STUDIO_AGENT_SYSTEM},
        {
            "role": "user",
            "content": (
                f"Analyze this draft for target keyword “{ctx.keyword.strip()}”. "
                f"Draft title: {ctx.title or '(untitled)'}. "
                "Call each analyze tool, then return the final JSON."
            ),
        },
    ]
    tool_events: list[dict[str, Any]] = []
    called: set[str] = set()

    for _round in range(MAX_TOOL_ROUNDS):
        try:
            llm_messages = sanitize_unicode_deep(openai_messages)
            if _supports_native_tools(client):
                result = client.chat_with_tools(llm_messages, tools)
            else:
                result = _react_step(client, llm_messages)
        except Exception as e:
            return {"ok": False, "error": str(e), "tool_events": tool_events}

        if result.tool_calls:
            assistant_tool_calls = []
            for i, tc in enumerate(result.tool_calls):
                if ollama_format:
                    assistant_tool_calls.append({
                        "type": "function",
                        "function": {
                            "index": i,
                            "name": tc.name,
                            "arguments": sanitize_unicode_deep(tc.arguments),
                        },
                    })
                else:
                    assistant_tool_calls.append({
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": json.dumps(tc.arguments or {}),
                        },
                    })

            if _supports_native_tools(client):
                openai_messages.append({
                    "role": "assistant",
                    "content": strip_surrogates(result.content or ""),
                    "tool_calls": assistant_tool_calls,
                })
            else:
                openai_messages.append({
                    "role": "assistant",
                    "content": f"Calling tool {result.tool_calls[0].name}",
                })

            for tc in result.tool_calls:
                tool_result = sanitize_unicode_deep(
                    dispatch_content_studio_tool(tc.name, ctx),
                )
                called.add(tc.name)
                tool_events.append({"name": tc.name, "args": tc.arguments, "result": tool_result})
                payload = json.dumps(tool_result, default=str)
                if ollama_format:
                    openai_messages.append({
                        "role": "tool",
                        "tool_name": tc.name,
                        "content": payload,
                    })
                else:
                    openai_messages.append({
                        "role": "tool",
                        "tool_call_id": tc.id,
                        "content": payload,
                    })
            continue

        if called >= REQUIRED_CONTENT_STUDIO_TOOLS:
            ai_block = _parse_final_json(result.content)
            if ai_block:
                return {"ok": True, "ai_block": ai_block, "tool_events": tool_events}
            return {
                "ok": False,
                "error": "Model returned no valid JSON after tool calls.",
                "tool_events": tool_events,
            }

        if called:
            _inject_missing_tools(openai_messages, ctx, called, ollama_format)
            for name in sorted(REQUIRED_CONTENT_STUDIO_TOOLS):
                if any(e["name"] == name for e in tool_events):
                    continue
                tool_events.append({
                    "name": name,
                    "args": {},
                    "result": dispatch_content_studio_tool(name, ctx),
                })
            continue

        break

    # Deterministic fallback: run all tools, single JSON synthesis
    tool_events = run_all_content_studio_tools(ctx)
    called = set(REQUIRED_CONTENT_STUDIO_TOOLS)
    tool_payload = {e["name"]: e["result"] for e in tool_events}
    try:
        user = json.dumps({
            "keyword": ctx.keyword,
            "title": ctx.title,
            "tool_results": tool_payload,
        }, indent=2, default=str)[:14000]
        ai_block = client.complete_json(CONTENT_STUDIO_AGENT_SYSTEM, user)
        if not isinstance(ai_block, dict):
            ai_block = parse_json_response(str(ai_block)) or {}
        if ai_block:
            return {"ok": True, "ai_block": ai_block, "tool_events": tool_events, "fallback": True}
    except Exception as e:
        return {"ok": False, "error": str(e), "tool_events": tool_events}

    return {
        "ok": False,
        "error": "Content analyze agent stopped without a final answer.",
        "tool_events": tool_events,
    }
