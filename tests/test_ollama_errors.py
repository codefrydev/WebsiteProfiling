"""Ollama API error formatting."""
from __future__ import annotations

from website_profiling.llm.providers.ollama import format_ollama_error


def test_format_model_not_found() -> None:
    msg = format_ollama_error(
        404,
        "model 'llama3.2' not found",
        "llama3.2",
    )
    assert "not installed" in msg
    assert "ollama pull llama3.2" in msg


def test_format_generic_404() -> None:
    msg = format_ollama_error(404, "", "m")
    assert "/api/chat" in msg
