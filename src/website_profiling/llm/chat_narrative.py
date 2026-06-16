"""Structured narrative synthesis for chat turns."""
from __future__ import annotations

import json
from typing import Any, Callable

from .base import get_llm_client, parse_json_response
from .prompts import CHAT_NARRATIVE_REPAIR_SYSTEM, CHAT_NARRATIVE_SYSTEM

MAX_ITEMS = 5
MAX_PAYLOAD_CHARS = 10000
MAX_PREVIOUS_RESPONSE_CHARS = 4000

NarrativeStatusCallback = Callable[[str], None]


class ChatNarrativeError(Exception):
    def __init__(self, message: str, errors: list[str] | None = None) -> None:
        super().__init__(message)
        self.errors = errors or []


def build_synthesis_payload(
    user_message: str,
    tool_events: list[dict[str, Any]],
    *,
    conversation_snippet: str | None = None,
) -> str:
    compact_events = [
        {
            "name": ev.get("name"),
            "args": ev.get("args"),
            "result": ev.get("result"),
        }
        for ev in tool_events
    ]
    payload: dict[str, Any] = {
        "user_question": user_message,
        "tool_results": compact_events,
    }
    if conversation_snippet:
        payload["conversation_context"] = conversation_snippet
    raw = json.dumps(payload, indent=2, default=str)
    if len(raw) > MAX_PAYLOAD_CHARS:
        return raw[:MAX_PAYLOAD_CHARS] + "\n…(truncated)"
    return raw


def _normalize_string_list(value: Any, field: str, errors: list[str]) -> list[str]:
    if value is None:
        errors.append(f"missing key {field}")
        return []
    if not isinstance(value, list):
        errors.append(f"{field} must be an array")
        return []
    if len(value) > MAX_ITEMS:
        errors.append(f"{field} has more than {MAX_ITEMS} items")
    out: list[str] = []
    for i, item in enumerate(value):
        if not isinstance(item, str):
            errors.append(f"{field}[{i}] must be a string")
            continue
        text = item.strip()
        if not text:
            errors.append(f"{field}[{i}] is empty")
            continue
        out.append(text)
        if len(out) >= MAX_ITEMS:
            break
    return out


def validate_chat_narrative(raw: dict[str, Any]) -> tuple[dict[str, list[str]], list[str]]:
    errors: list[str] = []
    if not isinstance(raw, dict):
        return {"power_insights": [], "recommended_actions": []}, ["response must be a JSON object"]

    insights = _normalize_string_list(raw.get("power_insights"), "power_insights", errors)
    actions = _normalize_string_list(raw.get("recommended_actions"), "recommended_actions", errors)

    if not insights and not actions:
        errors.append("both power_insights and recommended_actions are empty after normalization")

    return {"power_insights": insights, "recommended_actions": actions}, errors


def _coerce_attempt(raw: Any) -> tuple[dict[str, Any], str]:
    if isinstance(raw, dict):
        return raw, json.dumps(raw, default=str)
    text = str(raw or "").strip()
    return parse_json_response(text), text


def _attempt_synthesis(
    client: Any,
    system: str,
    user: str,
) -> tuple[dict[str, list[str]] | None, list[str], str]:
    errors: list[str] = []
    raw_text = ""
    try:
        raw = client.complete_json(system, user)
        parsed, raw_text = _coerce_attempt(raw)
        narrative, errors = validate_chat_narrative(parsed)
        if not errors:
            return narrative, [], raw_text
    except Exception as e:  # noqa: BLE001 - convert to validation errors for repair pass
        errors = [str(e).strip() or type(e).__name__]
        if not raw_text:
            raw_text = errors[0]
    return None, errors, raw_text


def synthesize_chat_narrative(
    cfg: dict[str, str],
    user_message: str,
    tool_events: list[dict[str, Any]],
    *,
    on_status: NarrativeStatusCallback | None = None,
) -> dict[str, list[str]]:
    """Synthesize narrative JSON; retries once with repair prompt before raising."""
    client = get_llm_client(cfg)
    payload = build_synthesis_payload(user_message, tool_events)

    if on_status:
        on_status("synthesizing")

    narrative, errors, previous = _attempt_synthesis(client, CHAT_NARRATIVE_SYSTEM, payload)
    if narrative is not None:
        return narrative

    if on_status:
        on_status("retrying")

    try:
        original_data = json.loads(payload)
    except json.JSONDecodeError:
        original_data = payload

    repair_payload = json.dumps(
        {
            "original_data": original_data,
            "previous_response": (previous or "")[:MAX_PREVIOUS_RESPONSE_CHARS],
            "errors": errors,
            "required_schema": {
                "power_insights": ["string"],
                "recommended_actions": ["string"],
            },
        },
        indent=2,
        default=str,
    )

    narrative2, errors2, _ = _attempt_synthesis(
        client, CHAT_NARRATIVE_REPAIR_SYSTEM, repair_payload,
    )
    if narrative2 is not None:
        return narrative2

    raise ChatNarrativeError(
        "Chat narrative synthesis failed after repair attempt.",
        errors=errors + errors2,
    )
