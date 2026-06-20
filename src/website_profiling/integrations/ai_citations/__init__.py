"""Live AI citation checks — opt-in, BYO key.

Public API
----------
check_citations(query, brand, domain, provider, api_key) -> CitationResult
resolve_api_key(provider, provided_key) -> str | None

Supported providers
-------------------
  perplexity  PERPLEXITY_API_KEY  real source URLs via Sonar
  openai      OPENAI_API_KEY      parametric brand knowledge
  anthropic   ANTHROPIC_API_KEY   parametric brand knowledge
  groq        GROQ_API_KEY        parametric brand knowledge

None of these are called unless the caller explicitly passes opt_in=True
and a valid API key (see check_ai_citations_live in integration_tools.py).
"""
from __future__ import annotations

import os

from ._clients import (
    AnthropicCitationClient,
    GroqCitationClient,
    OpenAICitationClient,
    PerplexityCitationClient,
    get_client,
)
from ._types import (
    CitationResult,
    _detect_competitors,
    _domain_in_sources,
    _parametric_brand_check,
    _parametric_prompt,
)

__all__ = [
    "CitationResult",
    "PerplexityCitationClient",
    "OpenAICitationClient",
    "AnthropicCitationClient",
    "GroqCitationClient",
    "resolve_api_key",
    "check_citations",
]

_ENV_VARS: dict[str, str] = {
    "perplexity": "PERPLEXITY_API_KEY",
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "groq": "GROQ_API_KEY",
}


def resolve_api_key(provider: str, provided_key: str | None) -> str | None:
    """Return ``provided_key`` if given, otherwise read from the environment."""
    if provided_key:
        return provided_key
    env = _ENV_VARS.get(provider.lower())
    return os.environ.get(env) or None if env else None


def check_citations(
    query: str,
    brand: str,
    domain: str,
    provider: str = "perplexity",
    api_key: str | None = None,
) -> CitationResult:
    """Run a live citation check. Requires opt-in and a valid API key."""
    key = resolve_api_key(provider, api_key)
    if not key:
        raise ValueError(
            f"No API key for provider {provider!r}. "
            f"Set {provider.upper()}_API_KEY env var or pass api_key."
        )
    return get_client(provider, key).check(query, brand, domain)
