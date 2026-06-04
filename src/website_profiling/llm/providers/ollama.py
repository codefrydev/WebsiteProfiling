"""Ollama local chat API."""
from __future__ import annotations

import json
from typing import Any

from ..base import parse_json_response


class OllamaClient:
    def __init__(self, cfg: dict[str, str]) -> None:
        self._model = (cfg.get("llm_model") or "llama3.2").strip()
        self._timeout = float(cfg.get("llm_timeout_s") or 120)
        self._base = (cfg.get("llm_base_url") or "http://127.0.0.1:11434").strip().rstrip("/")

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        try:
            import httpx
        except ImportError as e:
            raise ImportError("pip install httpx (or requirements-llm.txt)") from e

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
        with httpx.Client(timeout=self._timeout) as client:
            r = client.post(url, json=payload)
            r.raise_for_status()
            data = r.json()
        content = (data.get("message") or {}).get("content") or ""
        return parse_json_response(content if isinstance(content, str) else json.dumps(content))
