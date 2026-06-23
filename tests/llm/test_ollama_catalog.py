"""Ollama catalog merge and model lookup."""
from __future__ import annotations

from website_profiling.llm.ollama_catalog import (
    merge_ollama_models,
    model_is_configured,
    models_support_tools,
)


def test_merge_ollama_models_prefers_installed_local() -> None:
    local = [{"name": "llama3.2", "source": "local", "installed": True, "capabilities": ["tools"]}]
    cloud = [{"name": "llama3.2:cloud", "source": "cloud", "installed": False}]
    merged = merge_ollama_models(local, cloud)
    assert len(merged) >= 1
    entry = next(m for m in merged if m["name"] == "llama3.2")
    assert entry["installed"] is True
    assert entry["capabilities"] == ["tools"]


def test_model_is_configured_case_insensitive() -> None:
    models = [{"name": "Llama3.2", "source": "local", "installed": True}]
    assert model_is_configured(models, "llama3.2") is True
    assert models_support_tools(models) is False
