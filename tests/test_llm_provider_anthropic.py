"""Regression tests for the Anthropic message/tool converter.

An assistant message carrying OpenAI-shaped ``tool_calls`` must be reconstructed
into ``tool_use`` content blocks; otherwise the following ``tool_result`` has no
matching ``tool_use`` and the Anthropic Messages API returns HTTP 400 on every
multi-round tool conversation.
"""
from __future__ import annotations

import pytest

from website_profiling.llm.providers.anthropic import (
    _apply_prompt_caching,
    _to_anthropic_messages,
    _to_anthropic_tools,
)

_EPHEMERAL = {"type": "ephemeral"}


def test_assistant_tool_calls_become_matching_tool_use_blocks() -> None:
    messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "hi"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {"id": "call_1", "type": "function",
                 "function": {"name": "get_health", "arguments": '{"x": 1}'}},
            ],
        },
        {"role": "tool", "tool_call_id": "call_1", "content": '{"score": 80}'},
    ]
    system, conv = _to_anthropic_messages(messages)

    assert system == "sys"
    assistant = conv[1]
    assert assistant["role"] == "assistant"
    tool_use = [b for b in assistant["content"] if b["type"] == "tool_use"]
    assert len(tool_use) == 1
    assert tool_use[0]["id"] == "call_1"
    assert tool_use[0]["name"] == "get_health"
    assert tool_use[0]["input"] == {"x": 1}

    # The tool_result in the next turn references the same id -> valid pairing.
    tool_result = conv[2]["content"][0]
    assert tool_result["type"] == "tool_result"
    assert tool_result["tool_use_id"] == "call_1"


def test_assistant_tool_calls_with_dict_arguments_and_text() -> None:
    messages = [
        {"role": "assistant", "content": "thinking",
         "tool_calls": [{"id": "c2", "function": {"name": "foo", "arguments": {"a": 2}}}]},
    ]
    _, conv = _to_anthropic_messages(messages)
    blocks = conv[0]["content"]
    assert blocks[0] == {"type": "text", "text": "thinking"}
    assert blocks[1]["input"] == {"a": 2}


def test_invalid_tool_call_arguments_fall_back_to_empty() -> None:
    messages = [
        {"role": "assistant", "content": "",
         "tool_calls": [{"id": "c3", "function": {"name": "foo", "arguments": "not-json"}}]},
    ]
    _, conv = _to_anthropic_messages(messages)
    assert conv[0]["content"][0]["input"] == {}


def test_plain_messages_pass_through() -> None:
    _, conv = _to_anthropic_messages([{"role": "user", "content": "hi"}])
    assert conv == [{"role": "user", "content": "hi"}]


def test_to_anthropic_tools_maps_schema() -> None:
    tools = [{"type": "function", "function": {
        "name": "t", "description": "d", "parameters": {"type": "object", "properties": {}}}}]
    assert _to_anthropic_tools(tools) == [
        {"name": "t", "description": "d", "input_schema": {"type": "object", "properties": {}}},
    ]


# --- prompt caching --------------------------------------------------------


@pytest.fixture(autouse=True)
def _cache_on(monkeypatch: pytest.MonkeyPatch) -> None:
    """Caching defaults to on; pin it for deterministic tests."""
    monkeypatch.setenv("WP_LLM_PROMPT_CACHE", "1")


def test_caching_marks_last_tool_only() -> None:
    tools = [{"name": "a"}, {"name": "b"}, {"name": "c"}]
    _, tools_out, _ = _apply_prompt_caching("sys", tools, [])
    assert "cache_control" not in tools_out[0]
    assert "cache_control" not in tools_out[1]
    assert tools_out[-1]["cache_control"] == _EPHEMERAL
    # original list/dicts are untouched
    assert all("cache_control" not in t for t in tools)


def test_caching_empty_tools_is_safe() -> None:
    system, tools_out, _ = _apply_prompt_caching("sys", [], [])
    assert tools_out == []
    assert system == [{"type": "text", "text": "sys", "cache_control": _EPHEMERAL}]


def test_caching_system_becomes_text_block() -> None:
    system, _, _ = _apply_prompt_caching("the system prompt", [], [])
    assert system == [
        {"type": "text", "text": "the system prompt", "cache_control": _EPHEMERAL},
    ]


def test_caching_last_message_string_content_becomes_block() -> None:
    messages = [
        {"role": "user", "content": "first"},
        {"role": "user", "content": "second"},
    ]
    _, _, out = _apply_prompt_caching("sys", [], messages)
    # earlier message untouched
    assert out[0] == {"role": "user", "content": "first"}
    assert out[-1]["content"] == [
        {"type": "text", "text": "second", "cache_control": _EPHEMERAL},
    ]
    # caller's list/dicts not mutated
    assert messages[-1] == {"role": "user", "content": "second"}


def test_caching_last_message_list_content_marks_last_block() -> None:
    messages = [{
        "role": "user",
        "content": [
            {"type": "tool_result", "tool_use_id": "c1", "content": "{}"},
            {"type": "tool_result", "tool_use_id": "c2", "content": "{}"},
        ],
    }]
    _, _, out = _apply_prompt_caching("sys", [], messages)
    blocks = out[-1]["content"]
    assert "cache_control" not in blocks[0]
    assert blocks[-1]["cache_control"] == _EPHEMERAL
    # original untouched
    assert all("cache_control" not in b for b in messages[0]["content"])


def test_caching_disabled_returns_inputs_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WP_LLM_PROMPT_CACHE", "0")
    tools = [{"name": "a"}]
    messages = [{"role": "user", "content": "hi"}]
    system, tools_out, msgs_out = _apply_prompt_caching("sys", tools, messages)
    assert system == "sys"  # stays a plain string
    assert tools_out is tools
    assert msgs_out is messages


def test_caching_uses_at_most_four_breakpoints() -> None:
    tools = [{"name": "a"}, {"name": "b"}]
    messages = [
        {"role": "user", "content": "u"},
        {"role": "assistant", "content": [{"type": "text", "text": "a"}]},
    ]
    system, tools_out, msgs_out = _apply_prompt_caching("sys", tools, messages)

    def _count(obj: object) -> int:
        if isinstance(obj, dict):
            n = 1 if obj.get("cache_control") == _EPHEMERAL else 0
            return n + sum(_count(v) for v in obj.values())
        if isinstance(obj, list):
            return sum(_count(v) for v in obj)
        return 0

    total = _count(system) + _count(tools_out) + _count(msgs_out)
    assert total == 3
    assert total <= 4
