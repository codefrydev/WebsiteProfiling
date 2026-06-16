"""OpenAI-compatible chat completions with JSON output."""
from __future__ import annotations

import json
from typing import Any

from ..base import ChatResult, TokenCallback, ToolCall, parse_json_response


class OpenAIClient:
    def __init__(self, cfg: dict[str, str]) -> None:
        self._cfg = cfg
        self._model = (cfg.get("llm_model") or "gpt-4o-mini").strip()
        self._timeout = float(cfg.get("llm_timeout_s") or 120)
        self._api_key = (cfg.get("llm_api_key") or "").strip()
        self._base = (cfg.get("llm_base_url") or "https://api.openai.com/v1").strip().rstrip("/")

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        if not self._api_key:
            raise RuntimeError("OpenAI API key missing. Set it in the AI tab or OPENAI_API_KEY.")
        try:
            import httpx
        except ImportError as e:
            raise ImportError("pip install -r requirements.txt") from e

        payload = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        url = f"{self._base}/chat/completions"
        with httpx.Client(timeout=self._timeout) as client:
            r = client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            data = r.json()
        choice = (data.get("choices") or [{}])[0]
        content = (choice.get("message") or {}).get("content")
        if content is None:
            raise RuntimeError("OpenAI response contained no content.")
        return parse_json_response(content if isinstance(content, str) else json.dumps(content))

    def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        *,
        on_token: TokenCallback | None = None,
    ) -> ChatResult:
        if not self._api_key:
            raise RuntimeError("OpenAI API key missing. Set it in the AI tab or OPENAI_API_KEY.")
        try:
            import httpx
        except ImportError as e:
            raise ImportError("pip install -r requirements.txt") from e

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": messages,
            "tools": tools,
            "tool_choice": "auto",
            "temperature": 0.2,
            "stream": bool(on_token),
        }
        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        url = f"{self._base}/chat/completions"

        if on_token:
            return self._stream_chat(url, headers, payload, on_token)

        with httpx.Client(timeout=self._timeout) as client:
            r = client.post(url, headers=headers, json={**payload, "stream": False})
            r.raise_for_status()
            data = r.json()
        return self._parse_chat_response(data)

    def _parse_chat_response(self, data: dict[str, Any]) -> ChatResult:
        choice = (data.get("choices") or [{}])[0]
        msg = choice.get("message") or {}
        content = str(msg.get("content") or "")
        tool_calls: list[ToolCall] = []
        for tc in msg.get("tool_calls") or []:
            fn = tc.get("function") or {}
            raw_args = fn.get("arguments") or "{}"
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
            except json.JSONDecodeError:
                args = {}
            tool_calls.append(
                ToolCall(
                    id=str(tc.get("id") or ""),
                    name=str(fn.get("name") or ""),
                    arguments=args if isinstance(args, dict) else {},
                ),
            )
        return ChatResult(
            content=content,
            tool_calls=tool_calls,
            finish_reason=str(choice.get("finish_reason") or "stop"),
        )

    def _stream_chat(
        self,
        url: str,
        headers: dict[str, str],
        payload: dict[str, Any],
        on_token: TokenCallback,
    ) -> ChatResult:
        import httpx

        content_parts: list[str] = []
        tool_calls_acc: dict[int, dict[str, Any]] = {}

        with httpx.Client(timeout=self._timeout) as client:
            with client.stream("POST", url, headers=headers, json=payload) as resp:
                resp.raise_for_status()
                for line in resp.iter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    chunk_raw = line[6:].strip()
                    if chunk_raw == "[DONE]":
                        break
                    try:
                        chunk = json.loads(chunk_raw)
                    except json.JSONDecodeError:
                        continue
                    delta = ((chunk.get("choices") or [{}])[0]).get("delta") or {}
                    if delta.get("content"):
                        text = str(delta["content"])
                        content_parts.append(text)
                        on_token(text)
                    for tc in delta.get("tool_calls") or []:
                        idx = int(tc.get("index") or 0)
                        acc = tool_calls_acc.setdefault(
                            idx,
                            {"id": "", "name": "", "arguments": ""},
                        )
                        if tc.get("id"):
                            acc["id"] = tc["id"]
                        fn = tc.get("function") or {}
                        if fn.get("name"):
                            acc["name"] = fn["name"]
                        if fn.get("arguments"):
                            acc["arguments"] += fn["arguments"]

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
