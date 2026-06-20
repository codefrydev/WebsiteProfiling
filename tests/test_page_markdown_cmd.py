"""Tests for page markdown extraction pipeline entrypoint."""
from __future__ import annotations

from unittest.mock import MagicMock, patch


FIXTURE_HTML = "<html><head><title>Example</title></head><body><main><h1>Hello</h1><p>World.</p></main></body></html>"


class _MockConn:
    """Minimal psycopg-style mock connection that behaves as context manager."""

    def __init__(self, html_rows=None):
        self._html_rows = html_rows or []
        self.committed = False

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass

    def execute(self, sql, params=()):
        cur = MagicMock()
        cur.fetchone.return_value = None
        cur.fetchall.return_value = []
        if "crawl_runs" in sql or "get_latest" in sql:
            cur.fetchone.return_value = {"id": 1}
        return cur

    def commit(self):
        self.committed = True


def _make_db_session_ctx(conn):
    from contextlib import contextmanager

    @contextmanager
    def _ctx():
        yield conn

    return _ctx


def test_run_page_markdown_extraction_skips_when_no_run(monkeypatch, capsys):
    from website_profiling.page_markdown import pipeline as pm_pipeline

    monkeypatch.setattr(pm_pipeline, "db_session", _make_db_session_ctx(_MockConn()))
    monkeypatch.setattr(pm_pipeline, "get_latest_crawl_run_id", lambda conn: None)

    result = pm_pipeline.run_page_markdown_extraction()
    assert result["pages_extracted"] == 0
    assert "skipped" in capsys.readouterr().out.lower()


def test_run_page_markdown_extraction_skips_when_no_html(monkeypatch, capsys):
    from website_profiling.page_markdown import pipeline as pm_pipeline
    from website_profiling.db import html_store

    monkeypatch.setattr(pm_pipeline, "db_session", _make_db_session_ctx(_MockConn()))
    monkeypatch.setattr(pm_pipeline, "get_latest_crawl_run_id", lambda conn: 42)
    monkeypatch.setattr(html_store, "read_page_html_for_run", lambda conn, run_id, **kw: iter([]))

    result = pm_pipeline.run_page_markdown_extraction(crawl_run_id=42)
    assert result["pages_extracted"] == 0
    out = capsys.readouterr().out
    assert "no stored html" in out.lower()


def test_run_page_markdown_extraction_writes_results(monkeypatch, capsys):
    from website_profiling.page_markdown import pipeline as pm_pipeline
    from website_profiling.db import html_store, markdown_store as ms

    html_rows = [{"url": "https://example.com/", "html": FIXTURE_HTML}]

    monkeypatch.setattr(pm_pipeline, "db_session", _make_db_session_ctx(_MockConn()))
    monkeypatch.setattr(pm_pipeline, "get_latest_crawl_run_id", lambda conn: 7)
    monkeypatch.setattr(html_store, "read_page_html_for_run", lambda conn, run_id, **kw: iter(html_rows))

    written = []

    def fake_write(conn, records, run_id, prop_id, *, commit=True):
        written.extend(records)

    monkeypatch.setattr(pm_pipeline, "write_page_markdown_batch", fake_write)

    # Also stub extract_run_markdown to avoid actual markdownify call in unit test
    from website_profiling.page_markdown import batch as pm_batch
    monkeypatch.setattr(
        pm_batch,
        "extract_run_markdown",
        lambda conn, run_id, **kw: [{"url": "https://example.com", "markdown": "# Hello", "word_count": 1, "title": "Example", "strategy": "main_only", "source_byte_length": 100}],
    )

    result = pm_pipeline.run_page_markdown_extraction(crawl_run_id=7)
    assert result["pages_extracted"] == 1
    assert result["crawl_run_id"] == 7
    assert len(written) == 1
    assert written[0]["url"] == "https://example.com"


def test_page_markdown_cmd_run_prints_summary(monkeypatch, capsys):
    import argparse

    from website_profiling.commands import page_markdown_cmd

    monkeypatch.setattr(
        "website_profiling.page_markdown.pipeline.run_page_markdown_extraction",
        lambda **kw: {"pages_extracted": 3, "crawl_run_id": 9},
    )
    monkeypatch.setattr(
        "website_profiling.commands.config_resolve.active_property_id_from_cfg",
        lambda _cfg: 42,
    )
    args = argparse.Namespace(
        crawl_run_id=9,
        strategy="main_only",
        overwrite=True,
        workers=2,
        as_json=False,
    )
    page_markdown_cmd.run({}, args)
    out = capsys.readouterr().out
    assert "[page-markdown] Done:" in out
    assert "pages_extracted" in out


def test_page_markdown_cmd_run_json_output(monkeypatch, capsys):
    import argparse
    import json

    from website_profiling.commands import page_markdown_cmd

    summary = {"pages_extracted": 1, "crawl_run_id": 5}
    monkeypatch.setattr(
        "website_profiling.page_markdown.pipeline.run_page_markdown_extraction",
        lambda **kw: summary,
    )
    monkeypatch.setattr(
        "website_profiling.commands.config_resolve.active_property_id_from_cfg",
        lambda _cfg: None,
    )
    args = argparse.Namespace(
        crawl_run_id=None,
        strategy="full_body",
        overwrite=False,
        workers=4,
        as_json=True,
    )
    page_markdown_cmd.run({"start_url": "https://example.com"}, args)
    out = capsys.readouterr().out.strip()
    assert json.loads(out) == summary
