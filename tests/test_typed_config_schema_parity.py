"""Typed config manifest must cover all schema keys from web TS schemas."""
from __future__ import annotations

import json
import re
from pathlib import Path

from tests.config_test_utils import REPO_ROOT

MANIFEST_PATH = REPO_ROOT / "config" / "typed_config_manifest.json"
WEB_ROOT = REPO_ROOT / "web" / "src" / "lib"


def _load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def _extract_field_keys(ts_path: Path) -> set[str]:
    text = ts_path.read_text(encoding="utf-8")
    keys = set(re.findall(r"\bkey:\s*'([^']+)'", text))
    # Exclude visibleWhen rule keys duplicated in field definitions
    return keys


def _legacy_keys_from_manifest(manifest: dict) -> dict[str, set[str]]:
    """Map table name -> set of legacy pipeline/llm keys covered."""
    out: dict[str, set[str]] = {}
    for table, spec in manifest["tables"].items():
        keys: set[str] = set()
        for col_spec in spec.get("columns", {}).values():
            if "legacy_key" in col_spec:
                keys.add(col_spec["legacy_key"])
        if keys:
            out[table] = keys
    for table, key_list in manifest.get("pipeline_domain_tables", {}).items():
        out[table] = set(key_list)
    return out


def _all_manifest_legacy_keys(manifest: dict) -> set[str]:
    covered: set[str] = set()
    for keys in _legacy_keys_from_manifest(manifest).values():
        covered |= keys
    # Per-provider dynamic keys
    covered.add("llm_api_key")
    for provider in ("openai", "gemini", "anthropic", "groq", "ollama"):
        covered.add(f"llm_api_key_{provider}")
        covered.add(f"llm_model_{provider}")
    return covered


def test_manifest_file_exists():
    assert MANIFEST_PATH.is_file(), f"Missing {MANIFEST_PATH}"


def test_llm_schema_keys_covered_by_manifest():
    manifest = _load_manifest()
    llm_keys = _extract_field_keys(WEB_ROOT / "llmConfigSchema.ts")
    covered = _all_manifest_legacy_keys(manifest)
    missing = llm_keys - covered
    assert not missing, f"LLM schema keys not in manifest: {sorted(missing)}"


def test_pipeline_schema_keys_covered_by_manifest():
    manifest = _load_manifest()
    pipeline_keys = _extract_field_keys(WEB_ROOT / "pipelineConfigSchema.ts")
    pipeline_keys.add("active_property_id")
    covered = _all_manifest_legacy_keys(manifest)
    # Secrets moved to integration_secrets / mcp_settings
    secret_or_mcp = {
        "crawl_auth_password", "crawl_cookies", "google_rich_results_api_key",
        "bing_webmaster_api_key", "serp_api_key", "mcp_token", "mcp_allowed_hosts",
        "mcp_allowed_origins", "mcp_public_url", "mcp_domain",
    }
    risk_keys = {
        "mcp_disabled_tools", "mcp_enabled_domains", "feature_pipeline_enabled",
        "feature_write_enabled", "feature_pages_md_enabled", "feature_chat_enabled",
        "feature_mcp_visible", "feature_secrets_visible",
    }
    covered |= secret_or_mcp | risk_keys
    missing = pipeline_keys - covered
    assert not missing, f"Pipeline schema keys not in manifest: {sorted(missing)}"


def test_no_duplicate_legacy_key_mappings():
    manifest = _load_manifest()
    seen: dict[str, str] = {}
    for table, keys in _legacy_keys_from_manifest(manifest).items():
        for key in keys:
            if key in seen and seen[key] != table:
                raise AssertionError(f"Legacy key {key!r} mapped to both {seen[key]!r} and {table!r}")
            seen[key] = table


def test_pipeline_domain_tables_partition_schema():
    manifest = _load_manifest()
    domain = manifest.get("pipeline_domain_tables", {})
    all_domain_keys: set[str] = set()
    for table, keys in domain.items():
        overlap = all_domain_keys & set(keys)
        assert not overlap, f"Duplicate keys in pipeline domain tables: {sorted(overlap)}"
        all_domain_keys |= set(keys)
    pipeline_keys = _extract_field_keys(WEB_ROOT / "pipelineConfigSchema.ts")
    pipeline_keys.add("active_property_id")
    secrets = {
        "crawl_auth_password", "crawl_cookies", "google_rich_results_api_key",
        "bing_webmaster_api_key", "serp_api_key", "mcp_token", "mcp_allowed_hosts",
        "mcp_allowed_origins", "mcp_public_url", "mcp_domain",
        "mcp_disabled_tools", "mcp_enabled_domains",
        "feature_pipeline_enabled", "feature_write_enabled", "feature_pages_md_enabled",
        "feature_chat_enabled", "feature_mcp_visible", "feature_secrets_visible",
    }
    expected = pipeline_keys - secrets
    missing = expected - all_domain_keys - {"active_property_id", "warning_mapper_input", "warning_mapper_input_type"}
    assert not missing, f"Pipeline keys not assigned to domain table: {sorted(missing)}"
