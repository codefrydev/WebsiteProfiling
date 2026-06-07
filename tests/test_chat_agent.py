"""Tests for chat agent loop."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.llm.agent import MAX_TOOL_ROUNDS, run_agent_turn
from website_profiling.llm.base import ChatResult, ToolCall
from website_profiling.tools.audit_tools import AuditToolContext


class FakeToolClient:
    def __init__(self, steps: list[ChatResult]) -> None:
        self._steps = list(steps)
        self._calls = 0

    def chat_with_tools(self, messages, tools, *, on_token=None):
        result = self._steps[min(self._calls, len(self._steps) - 1)]
        self._calls += 1
        if on_token and result.content:
            on_token(result.content)
        return result


def test_agent_tool_then_answer() -> None:
    client = FakeToolClient([
        ChatResult(tool_calls=[ToolCall(id="tc1", name="list_issues", arguments={"limit": 5})]),
        ChatResult(content="Found 3 critical issues."),
    ])
    events: list[dict] = []
    ctx = AuditToolContext(property_id=1)

    with patch("website_profiling.llm.agent.load_llm_config_from_db", return_value={
        "llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test",
    }):
        with patch("website_profiling.llm.agent.get_llm_client", return_value=client):
            with patch(
                "website_profiling.llm.agent.dispatch_tool",
                return_value={"issues": [], "total": 0},
            ) as mock_dispatch:
                result = run_agent_turn(
                    [{"role": "user", "content": "What are the top issues?"}],
                    ctx,
                    on_event=events.append,
                )

    assert result["ok"] is True
    assert "critical" in result["message"].lower()
    mock_dispatch.assert_called_once()
    types = [e["type"] for e in events]
    assert "tool_start" in types
    assert "tool_end" in types
    assert "done" in types


def test_agent_disabled_llm() -> None:
    events: list[dict] = []
    with patch("website_profiling.llm.agent.load_llm_config_from_db", return_value={
        "llm_enabled": False, "llm_provider": "none",
    }):
        result = run_agent_turn(
            [{"role": "user", "content": "Hi"}],
            AuditToolContext(),
            on_event=events.append,
        )
    assert result["ok"] is False
    assert events[-1]["type"] == "error"


def test_max_tool_rounds() -> None:
    always_tool = ChatResult(
        tool_calls=[ToolCall(id="x", name="list_properties", arguments={})],
    )
    client = FakeToolClient([always_tool] * (MAX_TOOL_ROUNDS + 1))
    ctx = AuditToolContext()

    with patch("website_profiling.llm.agent.load_llm_config_from_db", return_value={
        "llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test",
    }):
        with patch("website_profiling.llm.agent.get_llm_client", return_value=client):
            with patch(
                "website_profiling.llm.agent.dispatch_tool",
                return_value={"properties": []},
            ):
                result = run_agent_turn(
                    [{"role": "user", "content": "List properties"}],
                    ctx,
                )

    assert result["ok"] is False
    assert "maximum tool rounds" in result["error"].lower()
