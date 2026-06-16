"""Shared test doubles for Content Studio agent tests."""
from __future__ import annotations

from website_profiling.content_studio.context import ContentStudioContext
from website_profiling.llm.base import ChatResult


class FakeToolClient:
    def __init__(self, steps: list[ChatResult]) -> None:
        self._steps = list(steps)
        self._calls = 0

    def chat_with_tools(self, messages, tools, *, on_token=None):
        result = self._steps[min(self._calls, len(self._steps) - 1)]
        self._calls += 1
        return result


class ReactClient:
    def __init__(self, steps: list[dict]) -> None:
        self._steps = list(steps)
        self._calls = 0

    def complete_json(self, system, user):
        payload = self._steps[min(self._calls, len(self._steps) - 1)]
        self._calls += 1
        return payload


class OllamaClient(FakeToolClient):
    """Stand-in for provider client; name must match _uses_ollama_tool_format check."""


def sample_ctx() -> ContentStudioContext:
    return ContentStudioContext(
        property_id=None,
        keyword="best crm",
        body_html="<h1>Best CRM</h1><p>best crm overview</p>",
    )
