"""Key routing for unified secrets API — mirrors web/src/lib/secretsConfigSchema.ts."""
from __future__ import annotations

from typing import Literal

PipelineSecretKeys = frozenset({
    "bing_webmaster_api_key",
    "serp_api_key",
    "google_rich_results_api_key",
    "crawl_auth_password",
    "crawl_cookies",
    "mcp_token",
})

McpManagedKeys = frozenset({
    "mcp_token",
    "mcp_allowed_hosts",
    "mcp_allowed_origins",
    "mcp_public_url",
    "mcp_domain",
    "mcp_enabled_domains",
})

RiskSettingsKeys = frozenset({
    "mcp_disabled_tools",
    "mcp_enabled_domains",
    "feature_pipeline_enabled",
    "feature_write_enabled",
    "feature_pages_md_enabled",
    "feature_chat_enabled",
    "feature_mcp_visible",
    "feature_secrets_visible",
})

LlmApiKeyFields = frozenset({
    "llm_api_key",
    "llm_api_key_openai",
    "llm_api_key_gemini",
    "llm_api_key_anthropic",
    "llm_api_key_groq",
})

SecretsStorage = Literal["llm", "pipeline", "google"]


def is_pipeline_secret_key(key: str) -> bool:
    return key in PipelineSecretKeys


def is_managed_pipeline_key(key: str) -> bool:
    return key in PipelineSecretKeys or key in McpManagedKeys or key in RiskSettingsKeys


def resolve_storage(key: str) -> SecretsStorage | None:
    if key.startswith("google_"):
        return "google"
    if is_managed_pipeline_key(key):
        return "pipeline"
    if key in LlmApiKeyFields or _is_secret_key(key):
        return "llm"
    return None


def google_field_from_state_key(key: str) -> str | None:
    if not key.startswith("google_"):
        return None
    return key[len("google_"):]


def _is_secret_key(key: str) -> bool:
    key_lower = key.lower()
    return (
        key_lower.endswith("_secret")
        or key_lower.endswith("_api_key")
        or key_lower.endswith("_key")
        or "api_key" in key_lower
        or "secret" in key_lower
        or "password" in key_lower
        or "token" in key_lower
    )
