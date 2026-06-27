"""Load and query config/typed_config_manifest.json."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[4]
MANIFEST_PATH = _REPO_ROOT / "config" / "typed_config_manifest.json"

_LLM_PROVIDERS = ("openai", "gemini", "anthropic", "groq", "ollama")


@lru_cache(maxsize=1)
def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def llm_providers() -> tuple[str, ...]:
    return _LLM_PROVIDERS


def singleton_tables() -> dict[str, dict]:
    return {
        name: spec
        for name, spec in load_manifest()["tables"].items()
        if spec.get("singleton") and name != "llm_provider_profiles"
    }


def pipeline_domain_tables() -> dict[str, list[str]]:
    return load_manifest()["pipeline_domain_tables"]


def flat_key_for_column(table: str, column: str) -> str | None:
    spec = load_manifest()["tables"].get(table, {})
    col_spec = spec.get("columns", {}).get(column, {})
    return col_spec.get("state_key") or col_spec.get("app_key")


def column_for_flat_key(table: str, flat_key: str) -> str | None:
    spec = load_manifest()["tables"].get(table, {})
    for column, col_spec in spec.get("columns", {}).items():
        fk = col_spec.get("state_key") or col_spec.get("app_key")
        if fk == flat_key:
            return column
    return None


def pipeline_state_key_to_column() -> dict[str, tuple[str, str]]:
    """Map flat pipeline state key -> (table_name, column_name)."""
    out: dict[str, tuple[str, str]] = {}
    for table, keys in pipeline_domain_tables().items():
        for key in keys:
            out[key] = (table, key)
    for table, spec in singleton_tables().items():
        if table in ("integration_secrets", "mcp_settings", "feature_flags", "workspace_settings"):
            for column, col_spec in spec.get("columns", {}).items():
                state_key = col_spec.get("state_key")
                if state_key:
                    out[state_key] = (table, column)
    return out


def llm_state_key_to_column() -> dict[str, str]:
    out: dict[str, str] = {}
    for column, col_spec in load_manifest()["tables"]["llm_settings"]["columns"].items():
        state_key = col_spec.get("state_key")
        if state_key:
            out[state_key] = column
    return out


def provider_state_key(column: str, provider: str) -> str:
    patterns = load_manifest()["tables"]["llm_provider_profiles"]["state_key_patterns"]
    return patterns[column].replace("{provider}", provider)
