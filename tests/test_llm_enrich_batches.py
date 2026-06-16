"""Regression tests for `_run_llm_batches` failure handling.

A failing batch must not abort the run, and the failure must be logged (observable)
in BOTH the sequential and the concurrent code paths — they used to diverge
(sequential propagated; concurrent silently swallowed).
"""
from __future__ import annotations

import pytest

from website_profiling.llm import enrich


class _BoomClient:
    """LLM client whose every call fails."""

    def complete_json(self, system: str, user: str) -> dict:
        raise RuntimeError("api unavailable")


def test_sequential_path_logs_and_continues_on_failure(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(enrich, "_llm_concurrency", lambda _cfg: 1)
    applied: list = []
    enrich._run_llm_batches(
        _BoomClient(),
        "task",
        "system",
        [{"k": 1}],
        {},
        lambda payload, result: applied.append(result),
    )
    out = capsys.readouterr().out
    assert "LLM enrichment batch failed" in out
    assert applied == []  # nothing applied, but no exception escaped


def test_concurrent_path_logs_and_continues_on_failure(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(enrich, "_llm_concurrency", lambda _cfg: 4)
    applied: list = []
    enrich._run_llm_batches(
        _BoomClient(),
        "task",
        "system",
        [{"k": 1}, {"k": 2}],  # >1 batch + workers>1 -> concurrent path
        {},
        lambda payload, result: applied.append(result),
    )
    out = capsys.readouterr().out
    assert out.count("LLM enrichment batch failed") >= 1
    assert applied == []
