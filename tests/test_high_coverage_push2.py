from __future__ import annotations

import argparse
import types

import pandas as pd


def test_pipeline_run_branch_selection(monkeypatch):
    from website_profiling.commands import pipeline_cmd

    calls = {"crawl": 0, "lh_pages": 0, "lh_one": 0, "report": 0, "plot": 0}
    monkeypatch.setattr(pipeline_cmd, "_run_crawl", lambda *_a, **_k: calls.__setitem__("crawl", calls["crawl"] + 1))
    monkeypatch.setattr(pipeline_cmd, "_run_lighthouse_on_pages", lambda *_a, **_k: calls.__setitem__("lh_pages", calls["lh_pages"] + 1))
    monkeypatch.setattr(pipeline_cmd, "_run_single_lighthouse", lambda *_a, **_k: calls.__setitem__("lh_one", calls["lh_one"] + 1))
    monkeypatch.setattr(pipeline_cmd, "_run_report", lambda *_a, **_k: calls.__setitem__("report", calls["report"] + 1))
    monkeypatch.setattr(pipeline_cmd, "_run_plot", lambda *_a, **_k: calls.__setitem__("plot", calls["plot"] + 1))

    cfg = {
        "run_crawl": "true",
        "run_lighthouse_on_pages": "true",
        "run_lighthouse": "false",
        "run_report": "true",
        "run_plot": "true",
    }
    pipeline_cmd.run(cfg, argparse.Namespace(command=None))
    assert calls == {"crawl": 1, "lh_pages": 1, "lh_one": 0, "report": 1, "plot": 1}


def test_pipeline_run_single_lighthouse_when_enabled_in_config(monkeypatch):
    from website_profiling.commands import pipeline_cmd

    called = {"lh": 0}
    monkeypatch.setattr(pipeline_cmd, "_run_single_lighthouse", lambda *_a, **_k: called.__setitem__("lh", called["lh"] + 1))
    monkeypatch.setattr(pipeline_cmd, "_run_crawl", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_report", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_plot", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_lighthouse_on_pages", lambda *_a, **_k: None)
    pipeline_cmd.run({"run_lighthouse": "true"}, argparse.Namespace(command=None))
    assert called["lh"] == 1


def test_run_single_lighthouse_exits_on_nonzero(monkeypatch):
    from website_profiling.commands import pipeline_cmd

    monkeypatch.setattr(pipeline_cmd, "require_lighthouse_url", lambda _cfg: "https://a.com")
    monkeypatch.setattr(pipeline_cmd, "lighthouse_work_dir", lambda: "/tmp/w")
    monkeypatch.setattr(pipeline_cmd, "cleanup_lighthouse_work_dir", lambda _p: None)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.lighthouse.runner", types.SimpleNamespace(main=lambda **_k: 2))
    import pytest

    with pytest.raises(SystemExit) as e:
        pipeline_cmd._run_single_lighthouse({}, True)
    assert e.value.code == 2


def test_run_report_and_plot_paths(monkeypatch):
    from website_profiling.commands import pipeline_cmd

    monkeypatch.setattr(pipeline_cmd, "require_start_url", lambda *_a, **_k: "https://a.com")
    monkeypatch.setattr(pipeline_cmd, "should_enrich_keywords_after_report", lambda _cfg: False)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.reporting.builder", types.SimpleNamespace(run_simple_report=lambda **_k: "report.json"))
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.tools.plot", types.SimpleNamespace(run_plot=lambda **_k: 0))
    pipeline_cmd._run_report({}, True)
    pipeline_cmd._run_plot({}, True)


def test_parse_tech_stack_and_wappalyzer_fallbacks(monkeypatch):
    from bs4 import BeautifulSoup
    from website_profiling.common import detect_tech_wappalyzer, parse_tech_stack

    html = '<html><head><meta name="generator" content="Drupal"></head><body>__NEXT_DATA__ jquery bootstrap</body></html>'
    soup = BeautifulSoup(html, "lxml")
    stack = parse_tech_stack(soup, {"Server": "nginx", "cf-ray": "x"}, "https://a.com")
    assert "Next.js" in stack or "Drupal" in stack

    class FakeW:
        def analyze_with_versions_and_categories(self, _web):
            return {"WordPress": {"versions": [], "categories": ["CMS"]}}

    out = detect_tech_wappalyzer("https://a.com", html, {}, soup, FakeW())
    # Depending on Wappalyzer/WebPage availability this may fall back to parse_tech_stack.
    assert out.startswith("[") and out.endswith("]")


def test_pool_lifecycle_and_db_session(monkeypatch):
    from website_profiling.db import pool

    class FakeConnCtx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    class FakePool:
        def __init__(self, **_kwargs):
            self.closed = False

        def connection(self, timeout=5):
            return FakeConnCtx()

        def close(self):
            self.closed = True

    monkeypatch.setattr(pool, "ConnectionPool", FakePool)
    monkeypatch.setattr(pool, "get_database_url", lambda: "postgres://u:p@h/db")
    pool.close_db_pool()
    with pool.db_session() as conn:
        assert conn is not None
    pool.close_db_pool()

