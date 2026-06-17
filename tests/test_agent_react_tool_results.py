"""Regression test: the ReAct fallback must show prior tool results to the model.

Providers without native tool calling (e.g. Gemini) go through `_react_step`. If
tool-result messages are excluded from the conversation, the model never sees the
output and keeps re-issuing the same call until MAX_TOOL_ROUNDS.
"""
from __future__ import annotations

from website_profiling.llm import agent as agent_mod


class _CapturingClient:
    def __init__(self) -> None:
        self.user_prompt = ""

    def complete_json(self, system: str, user: str) -> dict:
        self.user_prompt = user
        return {"action": "answer", "text": "done"}


def test_react_step_includes_tool_results_in_prompt() -> None:
    client = _CapturingClient()
    messages = [
        {"role": "user", "content": "how healthy is the site?"},
        {"role": "assistant", "content": "Calling tool get_health"},
        {"role": "tool", "tool_call_id": "x", "content": '{"score": 80}'},
    ]
    result = agent_mod._react_step(client, messages, "get_health", None)
    assert result.content == "done"
    assert '{"score": 80}' in client.user_prompt
