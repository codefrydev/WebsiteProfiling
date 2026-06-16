"""Tests for the Content Studio analyze agent loop (parallel tool dispatch)."""
from __future__ import annotations

from unittest.mock import patch

from website_profiling.content_studio.agent import run_content_studio_analyze
from website_profiling.content_studio.context import ContentStudioContext
from website_profiling.content_studio.tools import REQUIRED_CONTENT_STUDIO_TOOLS
from website_profiling.llm.base import ChatResult, ToolCall


class _FakeToolClient:
    def __init__(self, steps: list[ChatResult]) -> None:
        self._steps = list(steps)
        self._calls = 0

    def chat_with_tools(self, messages, tools, *, on_token=None):
        result = self._steps[min(self._calls, len(self._steps) - 1)]
        self._calls += 1
        return result


def test_content_studio_agent_dispatches_all_tools_in_one_turn() -> None:
    names = sorted(REQUIRED_CONTENT_STUDIO_TOOLS)
    client = _FakeToolClient([
        ChatResult(tool_calls=[
            ToolCall(id=f"t{i}", name=name, arguments={}) for i, name in enumerate(names)
        ]),
        ChatResult(content='{"summary": "ok", "suggestions": []}'),
    ])
    ctx = ContentStudioContext(
        property_id=None,
        keyword="best crm",
        body_html="<h1>Best CRM</h1><p>best crm overview</p>",
    )
    cfg = {"llm_provider": "openai", "llm_api_key": "sk-test"}

    with patch(
        "website_profiling.content_studio.agent.get_llm_client",
        return_value=client,
    ):
        result = run_content_studio_analyze(ctx, cfg)

    assert result["ok"] is True
    assert result["ai_block"]["summary"] == "ok"
    # all required analyze tools were dispatched in the single tool-calling turn
    assert sorted(e["name"] for e in result["tool_events"]) == names
