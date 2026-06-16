"""LLM provider abstraction for content enrichment."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any, Callable, Protocol


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]


@dataclass
class ChatResult:
    content: str = ""
    tool_calls: list[ToolCall] = field(default_factory=list)
    finish_reason: str = "stop"


TokenCallback = Callable[[str], None]

OLLAMA_DEFAULT_BASES = frozenset({
    "http://127.0.0.1:11434",
    "http://localhost:11434",
})


def is_ollama_base_url(url: str) -> bool:
    """True when llm_base_url points at a local Ollama daemon (not a cloud proxy)."""
    normalized = (url or "").strip().rstrip("/").lower()
    if normalized in OLLAMA_DEFAULT_BASES:
        return True
    return normalized.endswith(":11434")


def optional_cloud_base_url(cfg: dict[str, str]) -> str | None:
    """Custom OpenAI-compatible base URL; excludes Ollama's local default."""
    base = (cfg.get("llm_base_url") or "").strip().rstrip("/")
    if not base or is_ollama_base_url(base):
        return None
    return base


class LLMClient(Protocol):
    def complete_json(self, system: str, user: str) -> dict[str, Any]: ...

    def chat_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
        *,
        on_token: TokenCallback | None = None,
    ) -> ChatResult: ...


def parse_json_response(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
        return data if isinstance(data, dict) else {"data": data}
    except json.JSONDecodeError:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            data = json.loads(m.group(0))
            return data if isinstance(data, dict) else {"data": data}
        except json.JSONDecodeError:
            pass
    return {}


def get_llm_client(cfg: dict[str, str]) -> LLMClient:
    provider = (cfg.get("llm_provider") or "none").strip().lower()
    if provider == "openai":
        from .providers.openai import OpenAIClient

        return OpenAIClient(cfg)
    if provider == "anthropic":
        from .providers.anthropic import AnthropicClient

        return AnthropicClient(cfg)
    if provider == "gemini":
        from .providers.gemini import GeminiClient

        return GeminiClient(cfg)
    if provider == "groq":
        from .providers.groq import GroqClient

        return GroqClient(cfg)
    if provider == "ollama":
        from .providers.ollama import OllamaClient

        return OllamaClient(cfg)
    raise ValueError(f"Unknown LLM provider: {provider}")
