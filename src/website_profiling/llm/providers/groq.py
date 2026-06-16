"""Groq chat completions via official Python SDK."""
from __future__ import annotations

import json
from typing import Any

from ..base import ChatResult, TokenCallback, ToolCall, parse_json_response

DEFAULT_MODEL = "llama-3.3-70b-versatile"
_MISSING_KEY_MSG = "Groq API key missing. Set it in the AI tab or GROQ_API_KEY."


class GroqClient:
    def __init__(self, cfg: dict[str, str]) -> None:
        self._model = (cfg.get("llm_model") or DEFAULT_MODEL).strip()
        self._timeout = float(cfg.get("llm_timeout_s") or 120)
        self._api_key = (cfg.get("llm_api_key") or "").strip()
        base = (cfg.get("llm_base_url") or "").strip().rstrip("/")
        self._base_url = base or None

    def _client(self) -> Any:
        if not self._api_key:
            raise RuntimeError(_MISSING_KEY_MSG)
        try:
            from groq import Groq
        except ImportError as e:
            raise ImportError("pip install -r requirements.txt") from e

        kwargs: dict[str, Any] = {"api_key": self._api_key, "timeout": self._timeout}
        if self._base_url:
            kwargs["base_url"] = self._base_url
        return Groq(**kwargs)

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        client = self._client()
        completion = client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        choice = (completion.choices or [None])[0]
        if choice is None:
            raise RuntimeError("Groq response contained no choices.")
        content = choice.message.content
        if content is None:
            raise RuntimeError("Groq response contained no content.")
        return parse_json_response(content if isinstance(content, str) else json.dumps(content))

    def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        *,
        on_token: TokenCallback | None = None,
    ) -> ChatResult:
        client = self._client()
        kwargs: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.2,
        }
        if on_token:
            return self._stream_chat(client, kwargs, on_token)

        completion = client.chat.completions.create(**kwargs)
        choice = (completion.choices or [None])[0]
        if choice is None:
            return ChatResult()
        return self._parse_message(choice.message, finish_reason=str(choice.finish_reason or "stop"))

    def _parse_message(self, msg: Any, *, finish_reason: str = "stop") -> ChatResult:
        content = str(getattr(msg, "content", None) or "")
        tool_calls: list[ToolCall] = []
        for tc in getattr(msg, "tool_calls", None) or []:
            fn = getattr(tc, "function", None)
            raw_args = getattr(fn, "arguments", None) or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(
                ToolCall(
                    id=str(getattr(tc, "id", None) or ""),
                    name=str(getattr(fn, "name", None) or ""),
                    arguments=args if isinstance(args, dict) else {},
                ),
            )
        return ChatResult(content=content, tool_calls=tool_calls, finish_reason=finish_reason)

    def _stream_chat(
        self,
        client: Any,
        kwargs: dict[str, Any],
        on_token: TokenCallback,
    ) -> ChatResult:
        content_parts: list[str] = []
        tool_calls_acc: dict[int, dict[str, Any]] = {}

        stream = client.chat.completions.create(**kwargs, stream=True)
        for chunk in stream:
            choice = (chunk.choices or [None])[0]
            if choice is None:
                continue
            delta = choice.delta
            if getattr(delta, "content", None):
                text = str(delta.content)
                content_parts.append(text)
                on_token(text)
            for tc in getattr(delta, "tool_calls", None) or []:
                idx = int(getattr(tc, "index", None) or 0)
                acc = tool_calls_acc.setdefault(
                    idx,
                    {"id": "", "name": "", "arguments": ""},
                )
                if getattr(tc, "id", None):
                    acc["id"] = tc.id
                fn = getattr(tc, "function", None)
                if fn is not None:
                    if getattr(fn, "name", None):
                        acc["name"] = fn.name
                    if getattr(fn, "arguments", None):
                        acc["arguments"] += fn.arguments

        tool_calls: list[ToolCall] = []
        for acc in tool_calls_acc.values():
            raw_args = acc.get("arguments") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(
                ToolCall(
                    id=str(acc.get("id") or ""),
                    name=str(acc.get("name") or ""),
                    arguments=args if isinstance(args, dict) else {},
                ),
            )
        return ChatResult(content="".join(content_parts), tool_calls=tool_calls, finish_reason="stop")
