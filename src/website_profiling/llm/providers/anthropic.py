"""Anthropic Messages API."""
from __future__ import annotations

import json
from typing import Any

from ..base import ChatResult, TokenCallback, ToolCall, parse_json_response


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
            raise ImportError("pip install anthropic (or requirements-llm.txt)") from e

        client = anthropic.Anthropic(api_key=self._api_key, timeout=self._timeout)
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
            raise ImportError("pip install anthropic (or requirements-llm.txt)") from e

        system_parts: list[str] = []
        anthropic_messages: list[dict[str, Any]] = []
        for msg in messages:
            role = msg.get("role")
            if role == "system":
                system_parts.append(str(msg.get("content") or ""))
            elif role == "tool":
                anthropic_messages.append({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": str(msg.get("tool_call_id") or ""),
                        "content": str(msg.get("content") or ""),
                    }],
                })
            else:
                anthropic_messages.append({
                    "role": role if role in ("user", "assistant") else "user",
                    "content": str(msg.get("content") or ""),
                })

        anthropic_tools = []
        for tool in tools:
            fn = tool.get("function") or tool
            anthropic_tools.append({
                "name": fn.get("name"),
                "description": fn.get("description") or "",
                "input_schema": fn.get("parameters") or {"type": "object", "properties": {}},
            })

        client = anthropic.Anthropic(api_key=self._api_key, timeout=self._timeout)
        kwargs: dict[str, Any] = {
            "model": self._model,
            "max_tokens": 4096,
            "system": "\n".join(system_parts),
            "messages": anthropic_messages,
            "tools": anthropic_tools,
        }

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
