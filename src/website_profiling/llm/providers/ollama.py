"""Ollama local chat API with native tool calling when supported."""
from __future__ import annotations

import json
from typing import Any

from ..base import ChatResult, TokenCallback, ToolCall, parse_json_response


def normalize_messages_for_ollama(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert OpenAI-style tool messages to Ollama's expected chat format."""
    out: list[dict[str, Any]] = []
    for msg in messages:
        role = msg.get("role")
        if role == "tool":
            content = msg.get("content")
            out.append({
                "role": "tool",
                "tool_name": msg.get("tool_name") or msg.get("name") or "tool",
                "content": content if isinstance(content, str) else json.dumps(content, default=str),
            })
            continue

        cleaned: dict[str, Any] = {"role": role}
        content = msg.get("content")
        if content is not None:
            cleaned["content"] = content

        tool_calls = msg.get("tool_calls")
        if tool_calls:
            ollama_calls = []
            for i, tc in enumerate(tool_calls):
                if not isinstance(tc, dict):
                    continue
                fn = tc.get("function") or {}
                raw_args = fn.get("arguments", {})
                if isinstance(raw_args, str):
                    try:
                        args = json.loads(raw_args) if raw_args.strip() else {}
                    except json.JSONDecodeError:
                        args = {}
                elif isinstance(raw_args, dict):
                    args = raw_args
                else:
                    args = {}
                ollama_calls.append({
                    "type": "function",
                    "function": {
                        "index": fn.get("index", i),
                        "name": fn.get("name") or tc.get("name") or "",
                        "arguments": args,
                    },
                })
            cleaned["tool_calls"] = ollama_calls
            if "content" not in cleaned:
                cleaned["content"] = ""

        out.append(cleaned)
    return out


def _extract_ollama_error(response: Any) -> str:
    raw = ""
    try:
        if getattr(response, "is_stream_consumed", True) is False:
            body = response.read()
            raw = body.decode("utf-8", errors="replace") if isinstance(body, bytes) else str(body)
        else:
            raw = response.text or ""
    except Exception:
        raw = ""
    raw = raw.strip()
    if not raw:
        return ""
    try:
        data = json.loads(raw)
        if isinstance(data, dict) and data.get("error"):
            return str(data["error"]).strip()
    except json.JSONDecodeError:
        pass
    return raw


def format_ollama_error(status_code: int, detail: str, model: str) -> str:
    """Human-readable Ollama HTTP error for chat UI."""
    detail = detail.strip()
    low = detail.lower()
    if status_code == 404 and "model" in low and "not found" in low:
        return (
            f"Ollama model '{model}' is not installed. "
            f"Run `ollama pull {model}` or pick another model under Audit settings → AI."
        )
    if status_code == 404:
        hint = detail or "endpoint not found"
        return (
            f"Ollama returned 404 for /api/chat ({hint}). "
            "Check that Ollama is running, llm_base_url is correct, and your Ollama version supports chat."
        )
    if detail:
        return f"Ollama API error ({status_code}): {detail}"
    return f"Ollama API error ({status_code})."


class OllamaClient:
    def __init__(self, cfg: dict[str, str]) -> None:
        self._model = (cfg.get("llm_model") or "llama3.2").strip()
        configured = float(cfg.get("llm_timeout_s") or 120)
        self._timeout = max(configured, 300)
        self._base = (cfg.get("llm_base_url") or "http://127.0.0.1:11434").strip().rstrip("/")

    def _client(self):
        try:
            import httpx
        except ImportError as e:
            raise ImportError("pip install -r requirements.txt") from e
        return httpx.Client(timeout=self._timeout)

    def _raise_for_status(self, response: Any) -> None:
        if int(getattr(response, "status_code", 0) or 0) >= 400:
            detail = _extract_ollama_error(response)
            raise RuntimeError(format_ollama_error(response.status_code, detail, self._model))
        try:
            response.raise_for_status()
        except Exception as e:
            detail = _extract_ollama_error(response)
            if detail:
                raise RuntimeError(format_ollama_error(response.status_code, detail, self._model)) from e
            raise

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        payload = {
            "model": self._model,
            "stream": False,
            "format": "json",
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        url = f"{self._base}/api/chat"
        with self._client() as client:
            r = client.post(url, json=payload)
            self._raise_for_status(r)
            data = r.json()
        content = (data.get("message") or {}).get("content") or ""
        return parse_json_response(content if isinstance(content, str) else json.dumps(content))

    def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        *,
        on_token: TokenCallback | None = None,
    ) -> ChatResult:
        ollama_messages = normalize_messages_for_ollama(messages)
        payload: dict[str, Any] = {
            "model": self._model,
            "messages": ollama_messages,
            "tools": tools,
            "stream": bool(on_token),
        }
        url = f"{self._base}/api/chat"

        if on_token:
            return self._stream_chat(url, payload, on_token)

        with self._client() as client:
            r = client.post(url, json={**payload, "stream": False})
            self._raise_for_status(r)
            data = r.json()
        return self._parse_chat_response(data)

    def _parse_tool_calls(self, raw_calls: list[Any]) -> list[ToolCall]:
        tool_calls: list[ToolCall] = []
        for tc in raw_calls:
            if not isinstance(tc, dict):
                continue
            fn = tc.get("function") or {}
            raw_args = fn.get("arguments") or tc.get("arguments") or "{}"
            if isinstance(raw_args, dict):
                args = raw_args
            else:
                try:
                    args = json.loads(raw_args) if isinstance(raw_args, str) else dict(raw_args)
                except json.JSONDecodeError:
                    args = {}
            tool_calls.append(
                ToolCall(
                    id=str(tc.get("id") or f"ollama-{len(tool_calls)}"),
                    name=str(fn.get("name") or tc.get("name") or ""),
                    arguments=args if isinstance(args, dict) else {},
                ),
            )
        return tool_calls

    def _parse_chat_response(self, data: dict[str, Any]) -> ChatResult:
        msg = data.get("message") or {}
        content = str(msg.get("content") or "")
        tool_calls = self._parse_tool_calls(msg.get("tool_calls") or [])
        return ChatResult(
            content=content,
            tool_calls=tool_calls,
            finish_reason="tool_calls" if tool_calls else "stop",
        )

    def _stream_chat(
        self,
        url: str,
        payload: dict[str, Any],
        on_token: TokenCallback,
    ) -> ChatResult:
        content_parts: list[str] = []
        tool_calls: list[ToolCall] = []

        with self._client() as client:
            with client.stream("POST", url, json=payload) as resp:
                self._raise_for_status(resp)
                for line in resp.iter_lines():
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    msg = chunk.get("message") or {}
                    if msg.get("content"):
                        text = str(msg["content"])
                        content_parts.append(text)
                        on_token(text)
                    if msg.get("tool_calls"):
                        tool_calls = self._parse_tool_calls(msg["tool_calls"])
                    if chunk.get("done"):
                        break

        return ChatResult(
            content="".join(content_parts),
            tool_calls=tool_calls,
            finish_reason="tool_calls" if tool_calls else "stop",
        )
