"""Anthropic Messages API."""
from __future__ import annotations

import json
import os
import sys
from typing import Any

from ..base import ChatResult, TokenCallback, ToolCall, parse_json_response

# Ephemeral (5-minute) prompt-cache marker. Placed on the static request prefix
# (tools -> system -> conversation) so Anthropic bills repeated prefix tokens at
# ~10% of base input price across the multi-round tool loop. Mirrors how Claude
# Code caches its tool/system prefix.
_CACHE_CONTROL = {"type": "ephemeral"}


def _truthy(value: str | None, *, default: bool) -> bool:
    raw = (value or "").strip().lower()
    if not raw:
        return default
    return raw in ("1", "true", "yes", "on")


def _prompt_cache_enabled() -> bool:
    """Prompt caching is on by default; set WP_LLM_PROMPT_CACHE=0 to disable."""
    return _truthy(os.environ.get("WP_LLM_PROMPT_CACHE"), default=True)


def _cache_debug_enabled() -> bool:
    return _truthy(os.environ.get("WP_LLM_DEBUG_CACHE"), default=False)


def _log_cache_usage(usage: Any) -> None:
    """When WP_LLM_DEBUG_CACHE is set, print cache token counts to stderr."""
    if usage is None or not _cache_debug_enabled():
        return
    created = getattr(usage, "cache_creation_input_tokens", None)
    read = getattr(usage, "cache_read_input_tokens", None)
    inp = getattr(usage, "input_tokens", None)
    print(
        f"[wp-cache] input={inp} cache_creation={created} cache_read={read}",
        file=sys.stderr,
        flush=True,
    )


def _apply_prompt_caching(
    system: str,
    tools: list[dict[str, Any]],
    messages: list[dict[str, Any]],
) -> tuple[Any, list[dict[str, Any]], list[dict[str, Any]]]:
    """Add cache_control breakpoints to the static request prefix.

    Returns ``(system, tools, messages)`` unchanged when caching is disabled, so
    behavior is byte-identical to the no-cache path. Otherwise places three
    breakpoints (the limit is four) in Anthropic's prefix order:

    1. the last tool definition (caches the whole tools array),
    2. the system prompt (caches tools+system),
    3. the last content block of the last message (rolls forward each round,
       reading the prior conversation prefix from cache and writing the suffix).

    Builds new copies — never mutates the caller's lists/dicts — so the pure
    converter outputs stay clean.
    """
    if not _prompt_cache_enabled():
        return system, tools, messages

    # 1. System prompt -> single text block carrying the cache marker.
    system_blocks: Any = [
        {"type": "text", "text": system, "cache_control": _CACHE_CONTROL},
    ]

    # 2. Last tool definition.
    tools_out = list(tools)
    if tools_out:
        tools_out[-1] = {**tools_out[-1], "cache_control": _CACHE_CONTROL}

    # 3. Last content block of the last message.
    messages_out = list(messages)
    if messages_out:
        last = dict(messages_out[-1])
        content = last.get("content")
        if isinstance(content, list) and content:
            blocks = list(content)
            blocks[-1] = {**blocks[-1], "cache_control": _CACHE_CONTROL}
            last["content"] = blocks
        elif isinstance(content, str):
            last["content"] = [
                {"type": "text", "text": content, "cache_control": _CACHE_CONTROL},
            ]
        messages_out[-1] = last

    return system_blocks, tools_out, messages_out


def _to_anthropic_messages(messages: list[dict[str, Any]]) -> tuple[str, list[dict[str, Any]]]:
    """Convert OpenAI-shaped chat messages to ``(system, anthropic_messages)``.

    Assistant messages that carry ``tool_calls`` (the OpenAI shape the agent loop
    produces) are reconstructed into ``tool_use`` content blocks. Without this the
    following ``tool_result`` block has no matching ``tool_use`` in the prior
    assistant turn and the Anthropic Messages API rejects the request with HTTP 400,
    breaking every multi-round tool conversation.
    """
    system_parts: list[str] = []
    out: list[dict[str, Any]] = []
    for msg in messages:
        role = msg.get("role")
        if role == "system":
            system_parts.append(str(msg.get("content") or ""))
        elif role == "tool":
            out.append({
                "role": "user",
                "content": [{
                    "type": "tool_result",
                    "tool_use_id": str(msg.get("tool_call_id") or ""),
                    "content": str(msg.get("content") or ""),
                }],
            })
        elif role == "assistant" and msg.get("tool_calls"):
            blocks: list[dict[str, Any]] = []
            text = str(msg.get("content") or "")
            if text:
                blocks.append({"type": "text", "text": text})
            for tc in msg.get("tool_calls") or []:
                fn = tc.get("function") or {}
                raw_args = fn.get("arguments", tc.get("arguments"))
                if isinstance(raw_args, str):
                    try:
                        args = json.loads(raw_args or "{}")
                    except json.JSONDecodeError:
                        args = {}
                elif isinstance(raw_args, dict):
                    args = raw_args
                else:
                    args = {}
                blocks.append({
                    "type": "tool_use",
                    "id": str(tc.get("id") or ""),
                    "name": str(fn.get("name") or tc.get("name") or ""),
                    "input": args,
                })
            out.append({"role": "assistant", "content": blocks})
        else:
            out.append({
                "role": role if role in ("user", "assistant") else "user",
                "content": str(msg.get("content") or ""),
            })
    return "\n".join(system_parts), out


def _to_anthropic_tools(tools: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert OpenAI-shaped tool definitions to Anthropic ``input_schema`` form."""
    out: list[dict[str, Any]] = []
    for tool in tools:
        fn = tool.get("function") or tool
        out.append({
            "name": fn.get("name"),
            "description": fn.get("description") or "",
            "input_schema": fn.get("parameters") or {"type": "object", "properties": {}},
        })
    return out


class AnthropicClient:
    def __init__(self, cfg: dict[str, str]) -> None:
        self._cfg = cfg
        self._model = (cfg.get("llm_model") or "claude-3-5-haiku-latest").strip()
        self._timeout = float(cfg.get("llm_timeout_s") or 120)
        self._api_key = (cfg.get("llm_api_key") or "").strip()

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        if not self._api_key:
            raise RuntimeError("Anthropic API key missing. Set it in the AI tab or ANTHROPIC_API_KEY.")
        try:
            import anthropic
        except ImportError as e:
            raise ImportError("pip install -r requirements.txt") from e

        # Use the client as a context manager so its underlying httpx connection
        # pool is closed; otherwise every call leaks sockets across the agent loop.
        with anthropic.Anthropic(api_key=self._api_key, timeout=self._timeout) as client:
            msg = client.messages.create(
                model=self._model,
                max_tokens=4096,
                system=system + "\nRespond with valid JSON only.",
                messages=[{"role": "user", "content": user}],
            )
            parts = []
            for block in msg.content:
                if getattr(block, "type", None) == "text":
                    parts.append(block.text)
            return parse_json_response("\n".join(parts))

    def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        *,
        on_token: TokenCallback | None = None,
    ) -> ChatResult:
        if not self._api_key:
            raise RuntimeError("Anthropic API key missing. Set it in the AI tab or ANTHROPIC_API_KEY.")
        try:
            import anthropic
        except ImportError as e:
            raise ImportError("pip install -r requirements.txt") from e

        system, anthropic_messages = _to_anthropic_messages(messages)
        anthropic_tools = _to_anthropic_tools(tools)
        system, anthropic_tools, anthropic_messages = _apply_prompt_caching(
            system, anthropic_tools, anthropic_messages,
        )

        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 4096,
            "system": system,
            "messages": anthropic_messages,
            "tools": anthropic_tools,
        }

        # Context-manage the client so its httpx connection pool is closed on
        # every path (the non-streaming branch closed nothing before).
        with anthropic.Anthropic(api_key=self._api_key, timeout=self._timeout) as client:
            if on_token:
                content_parts: list[str] = []
                tool_calls: list[ToolCall] = []
                with client.messages.stream(**kwargs) as stream:
                    for event in stream:
                        if event.type == "content_block_delta" and hasattr(event.delta, "text"):
                            text = event.delta.text
                            content_parts.append(text)
                            on_token(text)
                        if event.type == "content_block_start" and getattr(event.content_block, "type", None) == "tool_use":
                            block = event.content_block
                            tool_calls.append(
                                ToolCall(id=block.id, name=block.name, arguments={}),
                            )
                        if event.type == "content_block_delta" and getattr(event.delta, "type", None) == "input_json_delta":
                            if tool_calls:
                                partial = getattr(event.delta, "partial_json", "") or ""
                                prev = tool_calls[-1].arguments.get("_partial", "")
                                tool_calls[-1].arguments["_partial"] = prev + partial
                    final = stream.get_final_message()
                _log_cache_usage(getattr(final, "usage", None))
                for tc in tool_calls:
                    partial = tc.arguments.pop("_partial", "")
                    if partial:
                        try:
                            tc.arguments = json.loads(partial)
                        except json.JSONDecodeError:
                            tc.arguments = {}
                text_parts = []
                for block in final.content:
                    if getattr(block, "type", None) == "text":
                        text_parts.append(block.text)
                return ChatResult(content="".join(content_parts) or "".join(text_parts), tool_calls=tool_calls)

            msg = client.messages.create(**kwargs)
            _log_cache_usage(getattr(msg, "usage", None))
            content_parts: list[str] = []
            tool_calls = []
            for block in msg.content:
                if getattr(block, "type", None) == "text":
                    content_parts.append(block.text)
                if getattr(block, "type", None) == "tool_use":
                    tool_calls.append(
                        ToolCall(
                            id=block.id,
                            name=block.name,
                            arguments=dict(block.input) if isinstance(block.input, dict) else {},
                        ),
                    )
            return ChatResult(content="".join(content_parts), tool_calls=tool_calls)
