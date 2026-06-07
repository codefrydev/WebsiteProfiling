"""Ollama chat message normalization for tool calling."""
from __future__ import annotations

import json

from website_profiling.llm.providers.ollama import normalize_messages_for_ollama


def test_tool_message_uses_tool_name_not_tool_call_id():
    msgs = normalize_messages_for_ollama([
        {"role": "user", "content": "hi"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [{
                "id": "call_1",
                "type": "function",
                "function": {"name": "list_properties", "arguments": "{}"},
            }],
        },
        {
            "role": "tool",
            "tool_call_id": "call_1",
            "content": '{"ok": true}',
        },
    ])
    tool_msg = msgs[-1]
    assert tool_msg["role"] == "tool"
    assert "tool_call_id" not in tool_msg
    assert tool_msg.get("tool_name") == "tool"
    assert tool_msg["content"] == '{"ok": true}'


def test_assistant_tool_call_arguments_are_objects():
    msgs = normalize_messages_for_ollama([
        {
            "role": "assistant",
            "tool_calls": [{
                "type": "function",
                "function": {"name": "list_issues", "arguments": '{"limit": 5}'},
            }],
        },
    ])
    fn = msgs[0]["tool_calls"][0]["function"]
    assert fn["arguments"] == {"limit": 5}


def test_assistant_tool_call_preserves_dict_arguments():
    msgs = normalize_messages_for_ollama([
        {
            "role": "assistant",
            "tool_calls": [{
                "type": "function",
                "function": {"name": "list_issues", "arguments": {"limit": 3}},
            }],
        },
    ])
    fn = msgs[0]["tool_calls"][0]["function"]
    assert fn["arguments"] == {"limit": 3}
