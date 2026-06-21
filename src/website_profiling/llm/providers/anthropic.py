"""Anthropic Messages API."""
from __future__ import annotations

import json
from typing import Any

from ..base import ChatResult, TokenCallback, ToolCall, parse_json_response


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
