"""Tests for chat agent loop."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.llm.agent import (
    MAX_TOOL_ROUNDS,
    MAX_TOOL_ROUNDS_EXTENDED,
    _max_tool_rounds,
    run_agent_turn,
)
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


def test_agent_runs_multiple_tool_calls_in_one_turn() -> None:
    """A turn with several tool calls dispatches them all; results stay in request order."""
    client = FakeToolClient([
        ChatResult(tool_calls=[
            ToolCall(id="a", name="get_report_summary", arguments={}),
            ToolCall(id="b", name="get_critical_issues", arguments={"limit": 5}),
            ToolCall(id="c", name="get_issue_priority_breakdown", arguments={}),
        ]),
        ChatResult(content="Here is your overview."),
    ])
    events: list[dict] = []
    ctx = AuditToolContext(property_id=1, report_id=1)
    dispatched: list[str] = []

    def fake_dispatch(name, args, *, context=None):
        dispatched.append(name)
        return {"tool": name, "ok": True}

    with patch("website_profiling.llm.agent.load_llm_config_from_db", return_value={
        "llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test",
    }):
        with patch("website_profiling.llm.agent.get_llm_client", return_value=client):
            with patch("website_profiling.llm.agent.chat_tool_mode", return_value="full"):
                with patch(
                    "website_profiling.llm.agent.dispatch_tool",
                    side_effect=fake_dispatch,
                ):
                    result = run_agent_turn(
                        [{"role": "user", "content": "give me a full audit overview"}],
                        ctx,
                        on_event=events.append,
                    )

    assert result["ok"] is True
    # every tool was dispatched...
    assert sorted(dispatched) == [
        "get_critical_issues", "get_issue_priority_breakdown", "get_report_summary",
    ]
    # ...and results were applied back in request order
    assert [e["name"] for e in result["tool_events"]] == [
        "get_report_summary", "get_critical_issues", "get_issue_priority_breakdown",
    ]
    starts = [e["name"] for e in events if e["type"] == "tool_start"]
    ends = [e["name"] for e in events if e["type"] == "tool_end"]
    assert starts == [
        "get_report_summary", "get_critical_issues", "get_issue_priority_breakdown",
    ]
    assert sorted(ends) == sorted(starts)


def test_agent_isolates_tool_exception() -> None:
    """A handler raising mid-turn becomes an error result instead of crashing the turn."""
    client = FakeToolClient([
        ChatResult(tool_calls=[ToolCall(id="x", name="list_issues", arguments={})]),
        ChatResult(content="Recovered."),
    ])
    ctx = AuditToolContext(property_id=1)

    with patch("website_profiling.llm.agent.load_llm_config_from_db", return_value={
        "llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test",
    }):
        with patch("website_profiling.llm.agent.get_llm_client", return_value=client):
            with patch("website_profiling.llm.agent.chat_tool_mode", return_value="full"):
                with patch(
                    "website_profiling.llm.agent.dispatch_tool",
                    side_effect=RuntimeError("db exploded"),
                ):
                    result = run_agent_turn(
                        [{"role": "user", "content": "list issues"}],
                        ctx,
                    )

    assert result["ok"] is True
    assert result["tool_events"][0]["result"]["error"] == "db exploded"


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
    events: list[dict] = []

    with patch("website_profiling.llm.agent.load_llm_config_from_db", return_value={
        "llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test",
        "llm_chat_unlimited_tool_rounds": "false",
    }):
        with patch("website_profiling.llm.agent.get_llm_client", return_value=client):
            with patch(
                "website_profiling.llm.agent.dispatch_tool",
                return_value={"properties": []},
            ):
                result = run_agent_turn(
                    [{"role": "user", "content": "List properties"}],
                    ctx,
                    on_event=events.append,
                )

    assert result["ok"] is False
    assert "maximum tool rounds" in result["error"].lower()
    assert result.get("message")
    assert events[-1]["type"] == "error"
    assert any(e["type"] == "partial_done" for e in events)


def test_max_tool_rounds_extended_when_unlimited_enabled() -> None:
    assert _max_tool_rounds({"llm_chat_unlimited_tool_rounds": "true"}) == MAX_TOOL_ROUNDS_EXTENDED
    assert _max_tool_rounds({"llm_chat_unlimited_tool_rounds": "false"}) == MAX_TOOL_ROUNDS
