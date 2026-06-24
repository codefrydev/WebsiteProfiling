"""Google Gemini generateContent API."""
from __future__ import annotations

from typing import Any

from ..base import parse_json_response


class GeminiClient:
    def __init__(self, cfg: dict[str, str]) -> None:
        self._model = (cfg.get("llm_model") or "gemini-2.0-flash").strip()
        self._timeout = float(cfg.get("llm_timeout_s") or 120)
        self._api_key = (cfg.get("llm_api_key") or "").strip()

    def complete_json(self, system: str, user: str) -> dict[str, Any]:
        if not self._api_key:
            raise RuntimeError("Gemini API key missing. Set it in the AI tab or GEMINI_API_KEY.")
        try:
            import httpx
        except ImportError as e:
            raise ImportError("pip install -r requirements.txt") from e

        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self._model}:generateContent"
        payload = {
            "contents": [{"parts": [{"text": f"{system}\n\n{user}\n\nRespond with valid JSON only."}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
        }
        with httpx.Client(timeout=self._timeout) as client:
            # Pass the key in a header, not the query string: URL query params are
            # logged by proxies / access logs / monitoring, leaking the API key.
            r = client.post(url, headers={"x-goog-api-key": self._api_key}, json=payload)
            r.raise_for_status()
            data = r.json()
        text = ""
        for cand in data.get("candidates") or []:
            for part in (cand.get("content") or {}).get("parts") or []:
                text += part.get("text") or ""
        return parse_json_response(text)
