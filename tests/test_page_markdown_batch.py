"""Coverage for page_markdown batch extraction."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from website_profiling.page_markdown import batch as pm_batch


def test_extract_row_skips_missing_html() -> None:
    assert pm_batch._extract_row({"url": "https://x.com", "html": ""}, strategy="main_only") is None
    assert pm_batch._extract_row({"url": "", "html": "<p>x</p>"}, strategy="main_only") is None


def test_extract_row_handles_extraction_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def _boom(*_a, **_k):
        raise RuntimeError("bad html")

    monkeypatch.setattr(pm_batch, "extract_page_markdown", _boom)
    row = {"url": "https://example.com", "html": "<html></html>"}
    assert pm_batch._extract_row(row, strategy="main_only") is None


def test_extract_run_markdown_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(pm_batch, "iter_html_pages", lambda *_a, **_k: iter([]))
    assert pm_batch.extract_run_markdown(MagicMock(), 1) == []


def test_extract_run_markdown_single_worker(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {
            "url": "https://example.com",
            "html": "<html><body><main>hello world content here</main></body></html>",
        }
    ]
    monkeypatch.setattr(pm_batch, "iter_html_pages", lambda *_a, **_k: iter(rows))
    out = pm_batch.extract_run_markdown(MagicMock(), 3, workers=1)
    assert len(out) == 1
    assert out[0]["url"] == "https://example.com"
    assert out[0]["word_count"] > 0


def test_extract_run_markdown_parallel_workers(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {
            "url": f"https://example.com/{i}",
            "html": f"<html><body><main>page {i} content words</main></body></html>",
        }
        for i in range(2)
    ]
    monkeypatch.setattr(pm_batch, "iter_html_pages", lambda *_a, **_k: iter(rows))
    out = pm_batch.extract_run_markdown(MagicMock(), 3, workers=2)
    assert len(out) == 2


def test_extract_run_markdown_skips_existing_when_not_overwrite(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {"url": "https://example.com/existing", "html": "<html><body><main>old</main></body></html>"},
        {"url": "https://example.com/new", "html": "<html><body><main>new page content</main></body></html>"},
    ]
    monkeypatch.setattr(pm_batch, "iter_html_pages", lambda *_a, **_k: iter(rows))

    def _list_existing(conn, crawl_run_id, *, limit=25, offset=0, query=""):
        if offset == 0:
            return {
                "items": [{"url": "https://example.com/existing"}],
                "total": 1,
                "limit": limit,
                "offset": offset,
            }
        return {"items": [], "total": 1, "limit": limit, "offset": offset}

    monkeypatch.setattr(
        "website_profiling.db.markdown_store.list_page_markdown",
        _list_existing,
    )
    out = pm_batch.extract_run_markdown(MagicMock(), 5, overwrite=False, workers=1)
    assert len(out) == 1
    assert out[0]["url"] == "https://example.com/new"


def test_extract_run_markdown_returns_empty_when_all_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [{"url": "https://example.com/a", "html": "<html><body><main>a</main></body></html>"}]
    monkeypatch.setattr(pm_batch, "iter_html_pages", lambda *_a, **_k: iter(rows))
    monkeypatch.setattr(
        "website_profiling.db.markdown_store.list_page_markdown",
        lambda *_a, **_k: {
            "items": [{"url": "https://example.com/a"}],
            "total": 1,
            "limit": 200,
            "offset": 0,
        },
    )
    assert pm_batch.extract_run_markdown(MagicMock(), 5, overwrite=False) == []


def test_extract_run_markdown_handles_empty_existing_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [
        {
            "url": "https://example.com/fresh",
            "html": "<html><body><main>fresh page content words</main></body></html>",
        }
    ]
    monkeypatch.setattr(pm_batch, "iter_html_pages", lambda *_a, **_k: iter(rows))
    monkeypatch.setattr(
        "website_profiling.db.markdown_store.list_page_markdown",
        lambda *_a, **_k: {"items": [], "total": 0, "limit": 200, "offset": 0},
    )
    out = pm_batch.extract_run_markdown(MagicMock(), 5, overwrite=False, workers=1)
    assert len(out) == 1
    assert out[0]["url"] == "https://example.com/fresh"
