"""Tests for Groq LLM provider (official Python SDK)."""
from __future__ import annotations

import sys
import types
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from website_profiling.llm.base import ChatResult, get_llm_client
from website_profiling.llm.providers.groq import DEFAULT_MODEL, GroqClient


def _install_fake_groq(monkeypatch: pytest.MonkeyPatch, client: MagicMock) -> MagicMock:
    mock_cls = MagicMock(return_value=client)
    fake = types.ModuleType("groq")
    fake.Groq = mock_cls
    monkeypatch.setitem(sys.modules, "groq", fake)
    return mock_cls


def test_get_llm_client_routes_groq() -> None:
    client = get_llm_client({"llm_provider": "groq", "llm_api_key": "gsk-test"})
    assert isinstance(client, GroqClient)


def test_default_model() -> None:
    client = GroqClient({"llm_provider": "groq", "llm_api_key": "gsk-test"})
    assert client._model == DEFAULT_MODEL


def test_explicit_model_and_base_url() -> None:
    client = GroqClient({
        "llm_api_key": "gsk-test",
        "llm_model": "llama-3.1-8b-instant",
        "llm_base_url": "https://custom.example/v1",
    })
    assert client._model == "llama-3.1-8b-instant"
    assert client._base_url == "https://custom.example/v1"


def test_ignores_ollama_base_url() -> None:
    client = GroqClient({
        "llm_api_key": "gsk-test",
        "llm_base_url": "http://127.0.0.1:11434",
    })
    assert client._base_url is None


def test_complete_json_missing_key_raises_groq_error() -> None:
    client = GroqClient({"llm_provider": "groq"})
    with pytest.raises(RuntimeError, match="Groq API key"):
        client.complete_json("system", "user")


def test_chat_with_tools_missing_key_raises_groq_error() -> None:
    client = GroqClient({"llm_provider": "groq"})
    with pytest.raises(RuntimeError, match="Groq API key"):
        client.chat_with_tools([], [])


def test_complete_json_uses_sdk(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_create = MagicMock(
        return_value=SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content='{"ok": true}'))],
        ),
    )
    sdk_client = MagicMock()
    sdk_client.chat.completions.create = mock_create
    mock_cls = _install_fake_groq(monkeypatch, sdk_client)

    client = GroqClient({"llm_api_key": "gsk-test"})
    assert client.complete_json("system", "user") == {"ok": True}
    mock_cls.assert_called_once_with(api_key="gsk-test", timeout=120.0)
    mock_create.assert_called_once()


def test_chat_with_tools_non_streaming(monkeypatch: pytest.MonkeyPatch) -> None:
    mock_create = MagicMock(
        return_value=SimpleNamespace(
            choices=[
                SimpleNamespace(
                    finish_reason="stop",
                    message=SimpleNamespace(
                        content="hello",
                        tool_calls=[
                            SimpleNamespace(
                                id="tc1",
                                function=SimpleNamespace(
                                    name="list_issues",
                                    arguments='{"limit": 5}',
                                ),
                            ),
                        ],
                    ),
                ),
            ],
        ),
    )
    sdk_client = MagicMock()
    sdk_client.chat.completions.create = mock_create
    _install_fake_groq(monkeypatch, sdk_client)

    client = GroqClient({"llm_api_key": "gsk-test"})
    result = client.chat_with_tools([{"role": "user", "content": "hi"}], [])
    assert result.content == "hello"
    assert len(result.tool_calls) == 1
    assert result.tool_calls[0].name == "list_issues"
    assert result.tool_calls[0].arguments == {"limit": 5}
    mock_create.assert_called_once_with(
        model=DEFAULT_MODEL,
        messages=[{"role": "user", "content": "hi"}],
        tools=[],
        tool_choice="auto",
        temperature=0.2,
    )


def test_chat_with_tools_streaming(monkeypatch: pytest.MonkeyPatch) -> None:
    chunks = [
        SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content="hel", tool_calls=None))],
        ),
        SimpleNamespace(
            choices=[SimpleNamespace(delta=SimpleNamespace(content="lo", tool_calls=None))],
        ),
    ]
    mock_create = MagicMock(return_value=iter(chunks))
    sdk_client = MagicMock()
    sdk_client.chat.completions.create = mock_create
    _install_fake_groq(monkeypatch, sdk_client)

    tokens: list[str] = []
    client = GroqClient({"llm_api_key": "gsk-test"})
    result = client.chat_with_tools(
        [{"role": "user", "content": "hi"}],
        [],
        on_token=tokens.append,
    )
    assert result.content == "hello"
    assert tokens == ["hel", "lo"]
    mock_create.assert_called_once()
    assert mock_create.call_args.kwargs["stream"] is True


def test_load_llm_config_from_db_groq_env_fallback(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("GROQ_API_KEY", "gsk-from-env")
    with patch("website_profiling.db.db_session") as mock_session:
        with patch(
            "website_profiling.db.storage.read_llm_config",
            return_value={"llm_provider": "groq", "llm_enabled": "true"},
        ):
            mock_session.return_value.__enter__ = MagicMock(return_value=MagicMock())
            mock_session.return_value.__exit__ = MagicMock(return_value=False)
            from website_profiling.llm_config import load_llm_config_from_db

            cfg = load_llm_config_from_db()
    assert cfg.get("llm_api_key") == "gsk-from-env"
    assert cfg.get("_llm_api_key_source") == "env"
