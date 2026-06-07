import argparse
import types

import pandas as pd


def test_pipeline_run_calls_crawl_with_minimal_config(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    called = {"crawl": 0}

    def fake_run_crawler(**_kwargs):
        called["crawl"] += 1
        return pd.DataFrame([{"url": "https://site.com", "status": 200}])

    # Patch crawler module function used in _run_crawl
    import website_profiling.crawl.crawler as crawler_mod

    monkeypatch.setattr(crawler_mod, "run_crawler", fake_run_crawler)

    cfg = {
        "start_url": "https://site.com",
        "run_crawl": "true",
        "run_report": "false",
        "run_plot": "false",
        "run_lighthouse": "false",
        "run_lighthouse_on_pages": "false",
    }
    args = argparse.Namespace(command=None)
    pipeline_cmd.run(cfg, args)
    assert called["crawl"] == 1


def test_run_crawl_passes_render_mode_to_run_crawler(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    captured: dict = {}

    def fake_run_crawler(**kwargs):
        captured.update(kwargs)
        return pd.DataFrame([{"url": "https://site.com", "status": 200}])

    import website_profiling.crawl.crawler as crawler_mod

    monkeypatch.setattr(crawler_mod, "run_crawler", fake_run_crawler)

    cfg = {
        "start_url": "https://site.com",
        "run_crawl": "true",
        "run_report": "false",
        "run_plot": "false",
        "run_lighthouse": "false",
        "run_lighthouse_on_pages": "false",
        "crawl_render_mode": "javascript",
        "crawl_js_concurrency": "2",
        "crawl_js_timeout": "25",
    }
    args = argparse.Namespace(command=None)
    pipeline_cmd.run(cfg, args)

    assert captured.get("render_mode") == "javascript"
    assert captured.get("js_concurrency") == 2
    assert captured.get("js_timeout") == 25


def test_pipeline_lighthouse_on_pages_uses_selected_urls(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    # Fake db session / read_crawl
    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    import website_profiling.db as db

    monkeypatch.setattr(db, "db_session", lambda: _Ctx())
    monkeypatch.setattr(db, "get_latest_crawl_run_id", lambda _c: 1)
    monkeypatch.setattr(
        db,
        "read_crawl",
        lambda _c, _rid: pd.DataFrame(
            [{"url": "https://a.com", "status": 200}, {"url": "https://b.com", "status": 404}]
        ),
    )

    urls_seen = {}

    def fake_lh_on_pages(urls, **_kwargs):
        urls_seen["urls"] = urls

    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(run_lighthouse_on_pages=fake_lh_on_pages),
    )

    cfg = {"lighthouse_strategy": "mobile", "lighthouse_iterations": "1"}
    pipeline_cmd._run_lighthouse_on_pages(cfg, lighthouse_max_pages=10)
    assert urls_seen["urls"] == ["https://a.com"]


def test_lighthouse_on_pages_swallows_google_data_errors(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    import website_profiling.db as db

    monkeypatch.setattr(db, "db_session", lambda: _Ctx())
    monkeypatch.setattr(db, "get_latest_crawl_run_id", lambda _c: 1)
    monkeypatch.setattr(
        db,
        "read_crawl",
        lambda _c, _rid: pd.DataFrame([{"url": "https://a.com", "status": 200}]),
    )
    monkeypatch.setattr(
        "website_profiling.integrations.google.store.read_latest_google_data",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("no google")),
    )
    urls_seen = {}
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(run_lighthouse_on_pages=lambda urls, **_k: urls_seen.setdefault("urls", urls)),
    )
    pipeline_cmd._run_lighthouse_on_pages({}, lighthouse_max_pages=5)
    assert urls_seen["urls"] == ["https://a.com"]

