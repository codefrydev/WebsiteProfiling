"""Tests for structured chat narrative synthesis."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.llm.chat_narrative import (
    ChatNarrativeError,
    build_synthesis_payload,
    synthesize_chat_narrative,
    validate_chat_narrative,
)


def test_validate_chat_narrative_accepts_valid_payload() -> None:
    narrative, errors = validate_chat_narrative({
        "power_insights": [" Strong crawl health "],
        "recommended_actions": ["Fix broken links"],
    })
    assert not errors
    assert narrative["power_insights"] == ["Strong crawl health"]
    assert narrative["recommended_actions"] == ["Fix broken links"]


def test_validate_chat_narrative_rejects_empty_arrays() -> None:
    _, errors = validate_chat_narrative({
        "power_insights": [],
        "recommended_actions": [],
    })
    assert any("empty" in e for e in errors)


def test_validate_chat_narrative_caps_items() -> None:
    items = [f"item {i}" for i in range(8)]
    narrative, errors = validate_chat_narrative({
        "power_insights": items,
        "recommended_actions": ["one"],
    })
    assert any("more than" in e for e in errors)
    assert len(narrative["power_insights"]) == 5


def test_build_synthesis_payload_truncates_large_tool_results() -> None:
    huge = {"blob": "x" * 20000}
    payload = build_synthesis_payload(
        "overview?",
        [{"name": "get_report_summary", "args": {}, "result": huge}],
    )
    assert len(payload) <= 10020
    assert "truncated" in payload


def test_synthesize_chat_narrative_success_first_attempt() -> None:
    client = MagicMock()
    client.complete_json.return_value = {
        "power_insights": ["Insight"],
        "recommended_actions": ["Action"],
    }
    with patch("website_profiling.llm.chat_narrative.get_llm_client", return_value=client):
        result = synthesize_chat_narrative(
            {"llm_provider": "openai"},
            "What is site health?",
            [{"name": "get_report_summary", "result": {"health": 80}}],
        )
    assert result["power_insights"] == ["Insight"]
    client.complete_json.assert_called_once()


def test_synthesize_chat_narrative_retries_on_invalid_first_attempt() -> None:
    client = MagicMock()
    client.complete_json.side_effect = [
        {"power_insights": []},
        {"power_insights": ["Fixed"], "recommended_actions": ["Do it"]},
    ]
    statuses: list[str] = []
    with patch("website_profiling.llm.chat_narrative.get_llm_client", return_value=client):
        result = synthesize_chat_narrative(
            {"llm_provider": "openai"},
            "overview",
            [],
            on_status=statuses.append,
        )
    assert result["power_insights"] == ["Fixed"]
    assert client.complete_json.call_count == 2
    assert statuses == ["synthesizing", "retrying"]


def test_synthesize_chat_narrative_raises_after_two_failures() -> None:
    client = MagicMock()
    client.complete_json.side_effect = [
        "not json",
        {"recommended_actions": ["only actions"]},
    ]
    with patch("website_profiling.llm.chat_narrative.get_llm_client", return_value=client):
        with pytest.raises(ChatNarrativeError):
            synthesize_chat_narrative({"llm_provider": "openai"}, "hi", [])
