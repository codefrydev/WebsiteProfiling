"""Additional coverage for content_analysis batch, pipeline, and related paths."""
from __future__ import annotations

import argparse
from unittest.mock import MagicMock

import pandas as pd
import pytest

from website_profiling.content_analysis import batch as ca_batch
from website_profiling.content_analysis.excerpt import build_excerpt
from website_profiling.content_analysis.pipeline import run_content_analysis
from website_profiling.content_analysis.dom_cleanup import cleanup_dom
from website_profiling.content_analysis.html_loader import load_soup
from website_profiling.content_analysis.main_content import find_main_content
from website_profiling.crawl.html_capture import should_store_page_html
from website_profiling.db import crawl_store as cs
from website_profiling.parsing.content import _count_syllables, parse_content_text


def test_build_excerpt_returns_full_when_under_limit() -> None:
    assert build_excerpt("short readable text", 100) == "short readable text"


def test_cleanup_dom_removes_aria_hidden() -> None:
    soup = load_soup(
        '<html><body><p>Keep</p><span aria-hidden="true">Hidden</span></body></html>'
    )
    cleaned = cleanup_dom(soup)
    text = cleaned.get_text()
    assert "Keep" in text
    assert "Hidden" not in text


def test_find_main_content_falls_back_to_body() -> None:
    soup = load_soup("<html><body><div>Only body copy here today.</div></body></html>")
    root = find_main_content(cleanup_dom(soup), strategy="main_only")
    assert "Only body copy" in root.get_text()


def test_cleanup_dom_does_not_strip_generic_content_classes() -> None:
    # Deliberately trimmed from CHROME_SELECTORS: bare `.menu`/`.top`/`.widget`
    # collide with legitimate content-wrapper class names on real sites.
    html = """
    <html><body><main>
      <div class="menu">Today's lunch menu: soup, salad, sandwich.</div>
      <div class="top">Top story of the day goes here.</div>
    </main></body></html>
    """
    soup = load_soup(html)
    cleaned = cleanup_dom(soup)
    text = cleaned.get_text()
    assert "lunch menu" in text
    assert "Top story" in text


def test_should_store_page_html_rejects_invalid_status() -> None:
    assert not should_store_page_html(
        enabled=True,
        status="not-a-number",
        content_type="text/html",
        html="<html></html>",
        max_bytes=1000,
    )


def test_parse_content_text_delegates_to_analyzer() -> None:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup("<html><body><p>Hello content world.</p></body></html>", "lxml")
    out = parse_content_text(soup, "<html><body><p>Hello content world.</p></body></html>")
    assert out["word_count"] > 0


def test_count_syllables_wrapper() -> None:
    assert _count_syllables("hello") >= 1


def test_analyze_row_skips_missing_html() -> None:
    assert ca_batch._analyze_row({"url": "https://x.com", "html": ""}, excerpt_max_chars=0, strategy="main_only") is None


def test_analyze_run_html_empty() -> None:
    assert ca_batch.analyze_run_html(MagicMock(), 1) == []


def test_analyze_run_html_single_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {
            "url": "https://example.com",
            "html": "<html><body><main>hello world content here</main></body></html>",
        }
    ]
    monkeypatch.setattr(ca_batch, "iter_html_pages", lambda *_a, **_k: iter(rows))
    out = ca_batch.analyze_run_html(MagicMock(), 3, workers=1)
    assert len(out) == 1
    assert out[0]["url"] == "https://example.com"
    assert out[0]["word_count"] > 0


def test_analyze_run_html_parallel_workers(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {"url": f"https://example.com/{i}", "html": f"<html><body><main>page {i} content words</main></body></html>"}
        for i in range(2)
    ]
    monkeypatch.setattr(ca_batch, "iter_html_pages", lambda *_a, **_k: iter(rows))
    out = ca_batch.analyze_run_html(MagicMock(), 3, workers=2)
    assert len(out) == 2


def test_analyze_run_html_skips_failing_page(monkeypatch: pytest.MonkeyPatch) -> None:
    # One page whose analysis raises must be skipped, not abort the whole batch.
    rows = [
        {"url": "https://good.com", "html": "<html>good</html>"},
        {"url": "https://bad.com", "html": "<html>bad</html>"},
    ]

    def fake_analyze(html, **_k):
        if "bad" in html:
            raise ValueError("boom")
        return {"word_count": 2}

    monkeypatch.setattr(ca_batch, "analyze_page_html", fake_analyze)
    monkeypatch.setattr(ca_batch, "iter_html_pages", lambda *_a, **_k: iter(rows))
    out1 = ca_batch.analyze_run_html(MagicMock(), 1, workers=1)
    assert [r["url"] for r in out1] == ["https://good.com"]
    monkeypatch.setattr(ca_batch, "iter_html_pages", lambda *_a, **_k: iter(rows))
    out2 = ca_batch.analyze_run_html(MagicMock(), 1, workers=2)
    assert [r["url"] for r in out2] == ["https://good.com"]


def test_iter_html_pages_paginates(monkeypatch: pytest.MonkeyPatch) -> None:
    chunks = [
        [{"url": "https://a.com", "html": "<html>a</html>"}] * 500,
        [{"url": "https://b.com", "html": "<html>b</html>"}],
    ]
    calls: list[tuple] = []

    def _fake_read(_conn, crawl_run_id, *, limit=5000, offset=0):
        calls.append((crawl_run_id, limit, offset))
        idx = offset // 500
        return iter(chunks[idx] if idx < len(chunks) else [])

    monkeypatch.setattr(ca_batch, "read_page_html_for_run", _fake_read)
    got = list(ca_batch.iter_html_pages(MagicMock(), 9))
    assert len(got) == 501
    assert calls[0] == (9, 500, 0)
    assert calls[1] == (9, 500, 500)


def test_run_content_analysis_skips_when_no_crawl_run(monkeypatch: pytest.MonkeyPatch) -> None:
    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, *_a):
            return False

    monkeypatch.setattr("website_profiling.content_analysis.pipeline.db_session", lambda: _Ctx())
    monkeypatch.setattr(
        "website_profiling.content_analysis.pipeline.get_latest_crawl_run_id",
        lambda _c: None,
    )
    summary = run_content_analysis()
    assert summary["pages_analyzed"] == 0
    assert summary["crawl_run_id"] is None


def test_merge_crawl_result_fields_batch_skips_invalid_rows(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cs, "_executemany", lambda *_a, **_k: None)
    conn = MagicMock()
    assert cs.merge_crawl_result_fields_batch(conn, 1, []) == 0
    assert cs.merge_crawl_result_fields_batch(conn, 1, [{"url": ""}]) == 0
    assert cs.merge_crawl_result_fields_batch(conn, 1, [{"url": "https://x.com"}]) == 0


def test_write_crawl_deletes_html_when_table_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    executed: list[str] = []

    class _Tx:
        def __enter__(self):
            return conn

        def __exit__(self, *_a):
            return False

    class _Conn:
        def transaction(self):
            return _Tx()

        def execute(self, sql, params=None):
            executed.append(sql)
            if "crawl_page_html" in sql:
                raise RuntimeError("missing table")

    conn = _Conn()
    monkeypatch.setattr(cs, "_crawl_rows_from_df", lambda df, run_id: [])
    monkeypatch.setattr(cs, "_write_crawl_rows", lambda *_a, **_k: None)
    cs.write_crawl(conn, pd.DataFrame([{"url": "https://a.com"}]), crawl_run_id=5)  # type: ignore[arg-type]
    assert any("crawl_page_html" in sql for sql in executed)
