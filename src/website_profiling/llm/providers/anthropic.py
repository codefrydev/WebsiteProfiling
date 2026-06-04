"""Anthropic Messages API."""
from __future__ import annotations

from typing import Any

from ..base import parse_json_response


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
