"""LLM provider abstraction for content enrichment."""
from __future__ import annotations

import json
import re
from typing import Any, Protocol


class LLMClient(Protocol):
    def complete_json(self, system: str, user: str) -> dict[str, Any]: ...


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
    if provider == "ollama":
        from .providers.ollama import OllamaClient

        return OllamaClient(cfg)
    raise ValueError(f"Unknown LLM provider: {provider}")
