"""Provider client classes for live AI citation checks.

Each client exposes a single ``check(query, brand, domain) -> CitationResult`` method.
Clients never import their HTTP library at module level so the package can be
imported in environments where ``httpx`` is not installed.
"""
from __future__ import annotations

from typing import Any

from ._types import (
    CitationResult,
    _detect_competitors,
    _domain_in_sources,
    _parametric_brand_check,
    _parametric_prompt,
)


class PerplexityCitationClient:
    """Perplexity Sonar — returns real web citations with source URLs."""

    def __init__(self, api_key: str) -> None:
        self.api_key = api_key

    def check(self, query: str, brand: str, domain: str) -> CitationResult:
        import httpx

        resp = httpx.post(
            "https://api.perplexity.ai/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            json={
                "model": "sonar",
                "messages": [{"role": "user", "content": query}],
                "return_citations": True,
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        answer = str((choice.get("message") or {}).get("content") or "")
        sources: list[str] = []
        for s in data.get("citations") or []:
            if isinstance(s, str):
                sources.append(s)
            elif isinstance(s, dict):
                sources.append(str(s.get("url") or s.get("link") or ""))
        sources = [s for s in sources if s]
        return CitationResult(
            query=query,
            brand=brand,
            domain=domain,
            provider="perplexity",
            brand_mentioned=brand.lower() in answer.lower(),
            domain_cited=_domain_in_sources(domain, sources),
            sources=sources,
            competitors_cited=_detect_competitors(sources, domain),
            answer_excerpt=answer,
        )


class _ParametricCitationClient:
    """Base for parametric (no live web search) citation clients.

    Subclasses implement ``_post`` which calls their provider API and returns
    the raw answer text. ``check`` handles the shared brand/domain detection.
    """

    provider: str = ""

    def _post(self, query: str, brand: str, domain: str) -> str:
        raise NotImplementedError

    def check(self, query: str, brand: str, domain: str) -> CitationResult:
        answer = self._post(query, brand, domain)
        brand_mentioned, domain_cited = _parametric_brand_check(brand, domain, answer)
        return CitationResult(
            query=query,
            brand=brand,
            domain=domain,
            provider=self.provider,
            brand_mentioned=brand_mentioned,
            domain_cited=domain_cited,
            answer_excerpt=answer,
        )


class OpenAICitationClient(_ParametricCitationClient):
    """OpenAI — parametric brand knowledge (no live web search)."""

    provider = "openai"

    def __init__(self, api_key: str, model: str = "gpt-4o-mini") -> None:
        self.api_key = api_key
        self.model = model

    def _post(self, query: str, brand: str, domain: str) -> str:
        import httpx

        resp = httpx.post(
            "https://api.openai.com/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": _parametric_prompt(query, brand, domain)}],
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        return str((data.get("choices") or [{}])[0].get("message", {}).get("content") or "")


class AnthropicCitationClient(_ParametricCitationClient):
    """Anthropic Claude — parametric brand knowledge."""

    provider = "anthropic"

    def __init__(self, api_key: str, model: str = "claude-3-haiku-20240307") -> None:
        self.api_key = api_key
        self.model = model

    def _post(self, query: str, brand: str, domain: str) -> str:
        import httpx

        resp = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            },
            json={
                "model": self.model,
                "max_tokens": 512,
                "messages": [{"role": "user", "content": _parametric_prompt(query, brand, domain)}],
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        blocks = data.get("content") or []
        return " ".join(str(b.get("text") or "") for b in blocks if isinstance(b, dict))


class GroqCitationClient(_ParametricCitationClient):
    """Groq — fast parametric brand knowledge check."""

    provider = "groq"

    def __init__(self, api_key: str, model: str = "llama3-8b-8192") -> None:
        self.api_key = api_key
        self.model = model

    def _post(self, query: str, brand: str, domain: str) -> str:
        import httpx

        resp = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            json={
                "model": self.model,
                "messages": [{"role": "user", "content": _parametric_prompt(query, brand, domain)}],
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
        return str((data.get("choices") or [{}])[0].get("message", {}).get("content") or "")


_PROVIDER_MAP: dict[str, Any] = {
    "perplexity": PerplexityCitationClient,
    "openai": OpenAICitationClient,
    "anthropic": AnthropicCitationClient,
    "groq": GroqCitationClient,
}


def get_client(provider: str, api_key: str) -> Any:
    """Return an instantiated citation client for the given provider."""
    cls = _PROVIDER_MAP.get(provider.lower())
    if not cls:
        raise ValueError(
            f"Unknown citation provider: {provider!r}. "
            f"Supported: {list(_PROVIDER_MAP)}"
        )
    return cls(api_key)
