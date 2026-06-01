"""OpenAI-compatible chat completions with JSON output."""
from __future__ import annotations

import json
from typing import Any

from ..base import parse_json_response


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
            raise ImportError("pip install httpx (or requirements-llm.txt)") from e

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
        content = data["choices"][0]["message"]["content"]
        return parse_json_response(content if isinstance(content, str) else json.dumps(content))
