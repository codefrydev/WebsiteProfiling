"""Tests for the Content Studio analyze agent loop."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.content_studio.agent import (
    _inject_missing_tools,
    _parse_final_json,
    _react_step,
    run_content_studio_analyze,
)
from website_profiling.content_studio.tools import REQUIRED_CONTENT_STUDIO_TOOLS
from website_profiling.llm.base import ChatResult, ToolCall

from tests.content_studio.fakes import FakeToolClient, OllamaClient, ReactClient, sample_ctx


def test_content_studio_agent_dispatches_all_tools_in_one_turn() -> None:
    names = sorted(REQUIRED_CONTENT_STUDIO_TOOLS)
    client = FakeToolClient([
        ChatResult(tool_calls=[
            ToolCall(id=f"t{i}", name=name, arguments={}) for i, name in enumerate(names)
        ]),
        ChatResult(content='{"summary": "ok", "suggestions": []}'),
    ])
    cfg = {"llm_provider": "openai", "llm_api_key": "sk-test"}

    with patch(
        "website_profiling.content_studio.agent.get_llm_client",
        return_value=client,
    ):
        result = run_content_studio_analyze(sample_ctx(), cfg)

    assert result["ok"] is True
    assert result["ai_block"]["summary"] == "ok"
    assert sorted(e["name"] for e in result["tool_events"]) == names


def test_react_step_tool_and_answer_paths() -> None:
    tool_result = _react_step(
        ReactClient([{"action": "tool", "name": "get_draft_seo_score", "args": {}}]),
        [{"role": "user", "content": "analyze"}],
    )
    assert tool_result.tool_calls[0].name == "get_draft_seo_score"

    json_result = _react_step(
        ReactClient([{"action": "answer", "text": '{"summary":"done"}'}]),
        [{"role": "user", "content": "analyze"}],
    )
    assert json_result.content == '{"summary":"done"}'

    plain_result = _react_step(
        ReactClient([{"action": "answer", "text": "plain text"}]),
        [{"role": "user", "content": "analyze"}],
    )
    assert plain_result.content == "plain text"


def test_parse_final_json_handles_fences_and_empty() -> None:
    assert _parse_final_json("") == {}
    fenced = _parse_final_json('```json\n{"summary":"ok"}\n```')
    assert fenced["summary"] == "ok"


def test_inject_missing_tools_appends_results() -> None:
    ctx = sample_ctx()
    messages: list[dict] = []
    called = {"get_draft_seo_score"}
    events: list[dict] = []
    _inject_missing_tools(messages, ctx, called, ollama_format=False, tool_events=events)
    assert any(m.get("role") == "tool" for m in messages)
    assert called == REQUIRED_CONTENT_STUDIO_TOOLS
    # tool_events is populated in the same pass (no second dispatch needed).
    assert {e["name"] for e in events} == REQUIRED_CONTENT_STUDIO_TOOLS - {"get_draft_seo_score"}
    messages_ollama: list[dict] = []
    called_ollama = {"get_draft_seo_score"}
    _inject_missing_tools(messages_ollama, ctx, called_ollama, ollama_format=True, tool_events=[])
    assert any(m.get("tool_name") for m in messages_ollama)


def test_content_studio_agent_ollama_tool_format() -> None:
    names = sorted(REQUIRED_CONTENT_STUDIO_TOOLS)
    client = OllamaClient([
        ChatResult(tool_calls=[
            ToolCall(id=f"t{i}", name=name, arguments={}) for i, name in enumerate(names)
        ]),
        ChatResult(content='{"summary": "ollama ok", "suggestions": []}'),
    ])
    with patch("website_profiling.content_studio.agent.get_llm_client", return_value=client):
        result = run_content_studio_analyze(sample_ctx(), {"llm_provider": "ollama"})
    assert result["ok"] is True
    assert result["ai_block"]["summary"] == "ollama ok"


def test_content_studio_agent_react_mode() -> None:
    names = sorted(REQUIRED_CONTENT_STUDIO_TOOLS)
    steps = [
        {"action": "tool", "name": names[0], "args": {}},
        *[{"action": "tool", "name": name, "args": {}} for name in names[1:]],
        {"action": "answer", "text": '{"summary": "react ok", "suggestions": []}'},
    ]
    client = ReactClient(steps)
    with patch("website_profiling.content_studio.agent.get_llm_client", return_value=client):
        result = run_content_studio_analyze(sample_ctx(), {"llm_provider": "none"})
    assert result["ok"] is True
    assert result["ai_block"]["summary"] == "react ok"


def test_content_studio_agent_injects_missing_tools_after_partial_turn() -> None:
    client = FakeToolClient([
        ChatResult(tool_calls=[ToolCall(id="t0", name="get_draft_seo_score", arguments={})]),
        ChatResult(content='not json yet'),
        ChatResult(content='{"summary": "filled gaps", "suggestions": []}'),
    ])
    with patch("website_profiling.content_studio.agent.get_llm_client", return_value=client):
        result = run_content_studio_analyze(sample_ctx(), {"llm_provider": "openai", "llm_api_key": "x"})
    assert result["ok"] is True
    assert sorted(e["name"] for e in result["tool_events"]) == sorted(REQUIRED_CONTENT_STUDIO_TOOLS)


def test_content_studio_agent_llm_client_value_error() -> None:
    with patch(
        "website_profiling.content_studio.agent.get_llm_client",
        side_effect=ValueError("bad provider"),
    ):
        result = run_content_studio_analyze(sample_ctx(), {})
    assert result["ok"] is False
    assert result["error"] == "bad provider"


def test_content_studio_agent_chat_exception() -> None:
    client = MagicMock()
    client.chat_with_tools.side_effect = RuntimeError("chat blew up")
    with patch("website_profiling.content_studio.agent.get_llm_client", return_value=client):
        result = run_content_studio_analyze(sample_ctx(), {"llm_provider": "openai", "llm_api_key": "x"})
    assert result["ok"] is False
    assert "chat blew up" in result["error"]


def test_content_studio_agent_invalid_json_after_tools() -> None:
    names = sorted(REQUIRED_CONTENT_STUDIO_TOOLS)
    client = FakeToolClient([
        ChatResult(tool_calls=[
            ToolCall(id=f"t{i}", name=name, arguments={}) for i, name in enumerate(names)
        ]),
        ChatResult(content="not valid json"),
    ])
    with patch("website_profiling.content_studio.agent.get_llm_client", return_value=client):
        result = run_content_studio_analyze(sample_ctx(), {"llm_provider": "openai", "llm_api_key": "x"})
    assert result["ok"] is False
    assert "no valid JSON" in result["error"]


def test_content_studio_agent_fallback_success() -> None:
    client = MagicMock()
    client.chat_with_tools.return_value = ChatResult(content="")
    client.complete_json.return_value = {"summary": "fallback", "suggestions": []}
    with patch("website_profiling.content_studio.agent.get_llm_client", return_value=client):
        result = run_content_studio_analyze(sample_ctx(), {"llm_provider": "openai", "llm_api_key": "x"})
    assert result["ok"] is True
    assert result["fallback"] is True
    assert result["ai_block"]["summary"] == "fallback"


def test_content_studio_agent_fallback_failure() -> None:
    client = MagicMock()
    client.chat_with_tools.return_value = ChatResult(content="")
    client.complete_json.side_effect = RuntimeError("fallback failed")
    with patch("website_profiling.content_studio.agent.get_llm_client", return_value=client):
        result = run_content_studio_analyze(sample_ctx(), {"llm_provider": "openai", "llm_api_key": "x"})
    assert result["ok"] is False
    assert result["error"] == "fallback failed"


def test_content_studio_agent_fallback_empty_answer() -> None:
    client = MagicMock()
    client.chat_with_tools.return_value = ChatResult(content="")
    client.complete_json.return_value = "not a dict"
    with patch("website_profiling.content_studio.agent.get_llm_client", return_value=client):
        result = run_content_studio_analyze(sample_ctx(), {"llm_provider": "openai", "llm_api_key": "x"})
    assert result["ok"] is False
    assert "stopped without a final answer" in result["error"]
