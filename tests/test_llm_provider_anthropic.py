"""Regression tests for the Anthropic message/tool converter.

An assistant message carrying OpenAI-shaped ``tool_calls`` must be reconstructed
into ``tool_use`` content blocks; otherwise the following ``tool_result`` has no
matching ``tool_use`` and the Anthropic Messages API returns HTTP 400 on every
multi-round tool conversation.
"""
from __future__ import annotations

from website_profiling.llm.providers.anthropic import (
    _to_anthropic_messages,
    _to_anthropic_tools,
)


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
