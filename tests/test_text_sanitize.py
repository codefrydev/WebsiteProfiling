"""Tests for surrogate stripping in chat/JSON paths."""
from __future__ import annotations

import json
from unittest.mock import patch

from website_profiling.llm.agent import run_agent_turn
from website_profiling.llm.base import ChatResult, ToolCall
from website_profiling.text_sanitize import sanitize_unicode_deep, strip_surrogates
from website_profiling.tools.audit_tools import AuditToolContext


def test_strip_surrogates_replaces_lone_surrogate() -> None:
    bad = "URL issue\udc9d here"
    cleaned = strip_surrogates(bad)
    assert "\udc9d" not in cleaned
    cleaned.encode("utf-8")


def test_sanitize_unicode_deep_nested() -> None:
    payload = {
        "issues": [{"message": "broken\udc9d", "url": "https://example.com"}],
    }
    cleaned = sanitize_unicode_deep(payload)
    serialized = json.dumps(cleaned, ensure_ascii=False)
    serialized.encode("utf-8")


def test_agent_surrogate_tool_result_does_not_break_llm_request() -> None:
    surrogate = "\udc9d"
    tool_payload = {
        "issues": [
            {
                "category": "Technical SEO",
                "priority": "High",
                "message": f"URL in sitemap but not crawled: https://codefrydev.in/2048{surrogate}",
                "url": "https://codefrydev.in/2048",
            },
        ],
        "total": 1,
        "truncated": False,
    }

    class RecordingClient:
        def __init__(self) -> None:
            self.last_messages: list[dict] | None = None

        def chat_with_tools(self, messages, tools, *, on_token=None):
            self.last_messages = messages
            if self.last_messages and any(
                m.get("role") == "tool" for m in self.last_messages
            ):
                return ChatResult(content="Summary with no further tools.")
            return ChatResult(
                tool_calls=[ToolCall(id="tc1", name="list_issues", arguments={"priority": "High"})],
            )

    client = RecordingClient()
    events: list[dict] = []

    with patch("website_profiling.llm.agent.load_llm_config_from_db", return_value={
        "llm_enabled": True, "llm_provider": "openai", "llm_api_key": "sk-test",
    }):
        with patch("website_profiling.llm.agent.get_llm_client", return_value=client):
            with patch(
                "website_profiling.llm.agent.dispatch_tool",
                return_value=tool_payload,
            ):
                result = run_agent_turn(
                    [{"role": "user", "content": "high risk audit issues"}],
                    AuditToolContext(property_id=1),
                    on_event=events.append,
                )

    assert result["ok"] is True
    assert client.last_messages is not None
    json.dumps(
        {"messages": client.last_messages, "tools": [], "stream": True},
        ensure_ascii=False,
    ).encode("utf-8")
    tool_end = next(e for e in events if e["type"] == "tool_end")
    assert "\udc9d" not in json.dumps(tool_end["result"])
