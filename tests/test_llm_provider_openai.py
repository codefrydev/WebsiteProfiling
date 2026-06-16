"""Regression tests for the OpenAI JSON-completion client.

`complete_json` must defensively handle a 200 response whose body lacks the
expected ``choices``/``message`` structure instead of raising KeyError/IndexError.
"""
from __future__ import annotations

import sys
import types

import pytest

from website_profiling.llm.providers.openai import OpenAIClient


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    def __init__(self, payload: dict) -> None:
        self._payload = payload

    def __call__(self, *args, **kwargs):  # httpx.Client(...) constructor
        return self

    def __enter__(self):
        return self

    def __exit__(self, *args) -> bool:
        return False

    def post(self, *args, **kwargs) -> _FakeResponse:
        return _FakeResponse(self._payload)


def _install_fake_httpx(monkeypatch: pytest.MonkeyPatch, payload: dict) -> None:
    fake = types.ModuleType("httpx")
    fake.Client = _FakeClient(payload)
    monkeypatch.setitem(sys.modules, "httpx", fake)


def test_complete_json_missing_choices_raises_clean_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_httpx(monkeypatch, {})  # no "choices"
    client = OpenAIClient({"llm_api_key": "sk-test"})
    with pytest.raises(RuntimeError, match="no content"):
        client.complete_json("system", "user")


def test_complete_json_parses_content_on_well_formed_response(monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_httpx(
        monkeypatch,
        {"choices": [{"message": {"content": '{"ok": true}'}}]},
    )
    client = OpenAIClient({"llm_api_key": "sk-test"})
    assert client.complete_json("system", "user") == {"ok": True}
