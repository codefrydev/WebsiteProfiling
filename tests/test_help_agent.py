"""Unit tests for the help agent."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.llm.help_agent import run_help_turn


def _make_fake_client(content: str = "Sure, here's how.", tokens: list[str] | None = None):
    client = MagicMock()
    result = MagicMock()
    result.content = content
    result.tool_calls = []

    def fake_chat(messages, tools, on_token=None):
        if tokens and on_token:
            for t in tokens:
                on_token(t)
        return result

    client.chat_with_tools.side_effect = fake_chat
    return client


def test_help_turn_disabled_llm() -> None:
    events: list[dict] = []

    with patch("website_profiling.llm.help_agent.load_llm_config_from_db", return_value={}):
        with patch("website_profiling.llm.help_agent.llm_is_enabled", return_value=False):
            result = run_help_turn(
                [{"role": "user", "content": "help"}],
                on_event=events.append,
            )

    assert result["ok"] is False
    assert any(e["type"] == "error" for e in events)


def test_help_turn_streams_tokens() -> None:
    events: list[dict] = []
    fake_client = _make_fake_client(tokens=["Hello", " world"])

    with patch("website_profiling.llm.help_agent.load_llm_config_from_db", return_value={"llm_provider": "openai"}):
        with patch("website_profiling.llm.help_agent.llm_is_enabled", return_value=True):
            with patch("website_profiling.llm.help_agent.get_llm_client", return_value=fake_client):
                result = run_help_turn(
                    [{"role": "user", "content": "help"}],
                    on_event=events.append,
                )

    assert result["ok"] is True
    token_events = [e for e in events if e["type"] == "token"]
    assert len(token_events) == 2
    assert token_events[0]["text"] == "Hello"
    assert token_events[1]["text"] == " world"
    done_events = [e for e in events if e["type"] == "done"]
    assert len(done_events) == 1


def test_help_turn_no_tools_passed() -> None:
    fake_client = _make_fake_client()

    with patch("website_profiling.llm.help_agent.load_llm_config_from_db", return_value={"llm_provider": "openai"}):
        with patch("website_profiling.llm.help_agent.llm_is_enabled", return_value=True):
            with patch("website_profiling.llm.help_agent.get_llm_client", return_value=fake_client):
                run_help_turn([{"role": "user", "content": "help"}])

    call_args = fake_client.chat_with_tools.call_args
    # tools is the second positional arg or passed as keyword
    tools_arg = call_args[0][1] if len(call_args[0]) > 1 else call_args[1].get("tools", None)
    assert tools_arg == []


def test_help_turn_buffered_content_emitted() -> None:
    """When on_token is never called (buffered provider), emit content once at end."""
    events: list[dict] = []
    fake_client = _make_fake_client(content="Buffered response", tokens=None)

    with patch("website_profiling.llm.help_agent.load_llm_config_from_db", return_value={"llm_provider": "openai"}):
        with patch("website_profiling.llm.help_agent.llm_is_enabled", return_value=True):
            with patch("website_profiling.llm.help_agent.get_llm_client", return_value=fake_client):
                result = run_help_turn(
                    [{"role": "user", "content": "help"}],
                    on_event=events.append,
                )

    assert result["ok"] is True
    token_texts = [e["text"] for e in events if e["type"] == "token"]
    assert "Buffered response" in token_texts


def test_help_turn_provider_error() -> None:
    events: list[dict] = []
    bad_client = MagicMock()
    bad_client.chat_with_tools.side_effect = ValueError("Connection refused")

    with patch("website_profiling.llm.help_agent.load_llm_config_from_db", return_value={"llm_provider": "openai"}):
        with patch("website_profiling.llm.help_agent.llm_is_enabled", return_value=True):
            with patch("website_profiling.llm.help_agent.get_llm_client", return_value=bad_client):
                result = run_help_turn(
                    [{"role": "user", "content": "help"}],
                    on_event=events.append,
                )

    assert result["ok"] is False
    error_events = [e for e in events if e["type"] == "error"]
    assert any("Connection refused" in e.get("message", "") for e in error_events)


def test_help_turn_unknown_provider() -> None:
    events: list[dict] = []

    with patch("website_profiling.llm.help_agent.load_llm_config_from_db", return_value={"llm_provider": "unknown"}):
        with patch("website_profiling.llm.help_agent.llm_is_enabled", return_value=True):
            with patch(
                "website_profiling.llm.help_agent.get_llm_client",
                side_effect=ValueError("Unknown LLM provider: unknown"),
            ):
                result = run_help_turn(
                    [{"role": "user", "content": "help"}],
                    on_event=events.append,
                )

    assert result["ok"] is False
    assert any("Unknown LLM provider" in e.get("message", "") for e in events if e["type"] == "error")


def test_help_turn_system_prompt_in_messages() -> None:
    """System prompt must be the first message sent to the client."""
    captured: list[list] = []
    fake_client = _make_fake_client()
    fake_client.chat_with_tools.side_effect = lambda msgs, tools, on_token=None: (
        captured.append(msgs) or MagicMock(content="ok", tool_calls=[])
    )

    with patch("website_profiling.llm.help_agent.load_llm_config_from_db", return_value={"llm_provider": "openai"}):
        with patch("website_profiling.llm.help_agent.llm_is_enabled", return_value=True):
            with patch("website_profiling.llm.help_agent.get_llm_client", return_value=fake_client):
                run_help_turn([{"role": "user", "content": "How do I add my API key?"}])

    assert captured
    messages_sent = captured[0]
    assert messages_sent[0]["role"] == "system"
    assert "help" in messages_sent[0]["content"].lower() or "credential" in messages_sent[0]["content"].lower()


def test_help_turn_no_event_callback() -> None:
    """run_help_turn must work when on_event is None."""
    fake_client = _make_fake_client(tokens=["Hi"])

    with patch("website_profiling.llm.help_agent.load_llm_config_from_db", return_value={"llm_provider": "openai"}):
        with patch("website_profiling.llm.help_agent.llm_is_enabled", return_value=True):
            with patch("website_profiling.llm.help_agent.get_llm_client", return_value=fake_client):
                result = run_help_turn([{"role": "user", "content": "hi"}])

    assert result["ok"] is True


@pytest.mark.parametrize("messages", [[], None])
def test_help_turn_empty_messages(messages) -> None:
    fake_client = _make_fake_client()

    with patch("website_profiling.llm.help_agent.load_llm_config_from_db", return_value={"llm_provider": "openai"}):
        with patch("website_profiling.llm.help_agent.llm_is_enabled", return_value=True):
            with patch("website_profiling.llm.help_agent.get_llm_client", return_value=fake_client):
                result = run_help_turn(messages or [])

    assert result["ok"] is True
