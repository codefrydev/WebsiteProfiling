"""Tests for merge_crawl_result_fields_batch and content analysis pipeline."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.db import crawl_store as cs


def test_merge_crawl_result_fields_batch(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple] = []

    def _fake_executemany(conn, sql, params, *, page_size=500):
        calls.append((sql, params))

    monkeypatch.setattr(cs, "_executemany", _fake_executemany)
    conn = MagicMock()
    n = cs.merge_crawl_result_fields_batch(
        conn,
        3,
        [{"url": "https://example.com/a", "word_count": 120, "top_keywords": "[]"}],
        commit=True,
    )
    assert n == 1
    conn.commit.assert_called_once()
    assert len(calls) == 1
    sql, params = calls[0]
    assert "crawl_results" in sql
    assert params[0][1] == 3
    assert params[0][2] == "https://example.com/a"


def test_run_content_analysis_skips_without_database(capsys) -> None:
    from website_profiling.commands import pipeline_cmd

    pipeline_cmd._run_content_analysis({"store_page_html": True}, False)
    assert "database required" in capsys.readouterr().out.lower()


def test_run_content_analysis_skips_without_html_storage(capsys) -> None:
    from website_profiling.commands import pipeline_cmd

    pipeline_cmd._run_content_analysis({"store_page_html": False}, True)
    assert "store_page_html" in capsys.readouterr().out


def test_run_content_analysis_runs_when_html_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.commands import pipeline_cmd

    calls: list[dict] = []

    monkeypatch.setattr(
        "website_profiling.content_analysis.run_content_analysis",
        lambda **kwargs: calls.append(kwargs) or {"pages_analyzed": 2},
    )

    pipeline_cmd._run_content_analysis(
        {
            "store_page_html": True,
            "store_content_excerpt": True,
            "content_excerpt_max_chars": "512",
            "content_analysis_strategy": "full_body",
            "content_analysis_workers": "2",
        },
        True,
    )
    assert calls[0]["strategy"] == "full_body"
    assert calls[0]["excerpt_max_chars"] == 512
    assert calls[0]["workers"] == 2



def test_run_content_analysis_invokes_batch(monkeypatch: pytest.MonkeyPatch) -> None:
    from website_profiling.content_analysis import pipeline as ca_pipeline

    calls: list[dict] = []

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, *_a):
            return False

    monkeypatch.setattr(ca_pipeline, "db_session", lambda: _Ctx())
    monkeypatch.setattr(ca_pipeline, "get_latest_crawl_run_id", lambda _c: 9)
    monkeypatch.setattr(
        ca_pipeline,
        "analyze_run_html",
        lambda *_a, **_k: [{"url": "https://ex.com", "word_count": 10, "top_keywords": "[]"}],
    )
    monkeypatch.setattr(
        ca_pipeline,
        "merge_crawl_result_fields_batch",
        lambda _c, run_id, updates, commit=True: calls.append({"run_id": run_id, "n": len(updates)}),
    )
    monkeypatch.setattr(ca_pipeline, "emit_phase_start", MagicMock())
    monkeypatch.setattr(ca_pipeline, "emit_phase_done", MagicMock())
    monkeypatch.setattr(ca_pipeline, "emit_progress", MagicMock())

    summary = ca_pipeline.run_content_analysis(excerpt_max_chars=0, strategy="main_only", workers=1)
    assert summary["pages_analyzed"] == 1
    assert calls[0]["run_id"] == 9
