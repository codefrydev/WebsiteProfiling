"""Agent loop for in-app chat and MCP — tool calling with streaming events."""
from __future__ import annotations

import json
from typing import Any, Callable

from ..llm_config import llm_is_enabled, load_llm_config_from_db
from ..tools.audit_tools import AuditToolContext
from ..tools.audit_tools.registry import TOOL_DEFINITIONS, dispatch_tool, openai_tools_schema
from .base import ChatResult, ToolCall, get_llm_client

MAX_TOOL_ROUNDS = 5

SYSTEM_PROMPT = """You are Site Audit AI, a technical SEO assistant for a self-hosted site audit platform.
You help users understand crawl results, audit issues, Lighthouse scores, keywords, and Search Console data.

Rules:
- Use the provided tools to query real audit data. Do not invent URLs, scores, or metrics.
- When citing issues, include the URL when available.
- Summarize clearly for SEO practitioners. Prefer bullet lists for multiple items.
- You are read-only: you cannot run crawls or change settings.
- If data is missing, say what integration or crawl step is needed.
"""

REACT_PROMPT_SUFFIX = """
Respond with valid JSON only, one of:
{"action":"tool","name":"<tool_name>","args":{...}}
{"action":"answer","text":"<your reply to the user>"}
"""


def _emit(on_event: Callable[[dict], None] | None, event: dict[str, Any]) -> None:
    if on_event:
        on_event(event)


def _supports_native_tools(client: Any) -> bool:
    return callable(getattr(client, "chat_with_tools", None))


def _react_step(
    client: Any,
    messages: list[dict[str, Any]],
    tools_desc: str,
    on_token: Callable[[str], None] | None,
) -> ChatResult:
    """JSON ReAct fallback for providers without native tool calling."""
    convo = "\n".join(
        f"{m.get('role')}: {m.get('content')}"
        for m in messages
        if m.get("role") in ("user", "assistant", "system")
    )
    user = f"Available tools:\n{tools_desc}\n\nConversation:\n{convo}\n\nNext action JSON:"
    data = client.complete_json(SYSTEM_PROMPT + REACT_PROMPT_SUFFIX, user)
    action = str(data.get("action") or "").lower()
    if action == "tool":
        name = str(data.get("name") or "")
        args = data.get("args") if isinstance(data.get("args"), dict) else {}
        return ChatResult(
            tool_calls=[ToolCall(id="react-0", name=name, arguments=args)],
        )
    text = str(data.get("text") or data.get("answer") or data.get("content") or "")
    if on_token and text:
        on_token(text)
    return ChatResult(content=text)


def _tools_description() -> str:
    lines = []
    for t in TOOL_DEFINITIONS:
        lines.append(f"- {t['name']}: {t.get('description', '')}")
    return "\n".join(lines)


def _build_openai_messages(history: list[dict[str, str]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for msg in history:
        role = msg.get("role")
        content = str(msg.get("content") or "")
        if role in ("user", "assistant"):
            out.append({"role": role, "content": content})
    return out


def run_agent_turn(
    messages: list[dict[str, str]],
    context: AuditToolContext,
    *,
    on_event: Callable[[dict], None] | None = None,
) -> dict[str, Any]:
    """
    Run the agent loop. Emits NDJSON-style events via on_event.
    Returns final result dict with ok, message, tool_events.
    """
    cfg = load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        err = "AI is disabled. Enable AI insights in the AI settings tab and configure a provider."
        _emit(on_event, {"type": "error", "message": err})
        return {"ok": False, "error": err}

    try:
        client = get_llm_client(cfg)
    except ValueError as e:
        msg = str(e)
        _emit(on_event, {"type": "error", "message": msg})
        return {"ok": False, "error": msg}

    openai_messages = _build_openai_messages(messages)
    tools = openai_tools_schema()
    tool_events: list[dict[str, Any]] = []
    final_message = ""

    def on_token(text: str) -> None:
        _emit(on_event, {"type": "token", "text": text})

    for _round in range(MAX_TOOL_ROUNDS):
        if _supports_native_tools(client):
            result = client.chat_with_tools(openai_messages, tools, on_token=on_token)
        else:
            result = _react_step(client, openai_messages, _tools_description(), on_token)

        if result.tool_calls:
            assistant_tool_calls = []
            for tc in result.tool_calls:
                assistant_tool_calls.append({
                    "id": tc.id,
                    "type": "function",
                    "function": {"name": tc.name, "arguments": json.dumps(tc.arguments)},
                })

            if _supports_native_tools(client):
                openai_messages.append({
                    "role": "assistant",
                    "content": result.content or None,
                    "tool_calls": assistant_tool_calls,
                })
            else:
                openai_messages.append({
                    "role": "assistant",
                    "content": f"Calling tool {result.tool_calls[0].name}",
                })

            for tc in result.tool_calls:
                _emit(on_event, {"type": "tool_start", "name": tc.name, "args": tc.arguments})
                tool_result = dispatch_tool(tc.name, tc.arguments, context=context)
                _emit(on_event, {"type": "tool_end", "name": tc.name, "result": tool_result})
                tool_events.append({"name": tc.name, "args": tc.arguments, "result": tool_result})

                openai_messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": json.dumps(tool_result, default=str),
                })
            continue

        final_message = result.content.strip()
        if final_message:
            _emit(on_event, {"type": "done", "message": final_message})
            return {"ok": True, "message": final_message, "tool_events": tool_events}

        break

    err = "Agent stopped after maximum tool rounds without a final answer."
    _emit(on_event, {"type": "error", "message": err})
    return {"ok": False, "error": err, "tool_events": tool_events}
