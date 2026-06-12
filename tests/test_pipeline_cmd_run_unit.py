import argparse
import io
import sys
import types

import pandas as pd
import pytest


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
        return {"attempted": len(urls), "succeeded": len(urls), "failed": 0}

    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(run_lighthouse_on_pages=fake_lh_on_pages),
    )

    cfg = {"lighthouse_strategy": "mobile", "lighthouse_iterations": "1"}
    pipeline_cmd._run_lighthouse_on_pages(cfg, lighthouse_max_pages=10)
    assert urls_seen["urls"] == ["https://a.com"]


def _patch_lighthouse_on_pages_db(monkeypatch):
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
    monkeypatch.setattr(pipeline_cmd, "lighthouse_work_dir", lambda: "/tmp/lh")
    monkeypatch.setattr(pipeline_cmd, "cleanup_lighthouse_work_dir", lambda _p: None)
    return pipeline_cmd


def test_pipeline_lighthouse_on_pages_all_failures_emit_error(monkeypatch) -> None:
    pipeline_cmd = _patch_lighthouse_on_pages_db(monkeypatch)

    def fake_get_int(cfg, key, default=None):
        if key == "crawl_js_extra_wait_ms":
            return None
        from website_profiling.config import get_int as real_get_int

        return real_get_int(cfg, key, default)

    monkeypatch.setattr(pipeline_cmd, "get_int", fake_get_int)
    progress: list[tuple] = []
    monkeypatch.setattr(
        pipeline_cmd,
        "emit_progress",
        lambda phase, step, **kw: progress.append((phase, step, kw)),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(
            run_lighthouse_on_pages=lambda **_k: {"attempted": 2, "succeeded": 0, "failed": 2},
        ),
    )
    pipeline_cmd._run_lighthouse_on_pages({"crawl_js_extra_wait_ms": ""}, lighthouse_max_pages=5)
    assert ("lighthouse", "error") in [(p, s) for p, s, _ in progress]


def test_pipeline_lighthouse_on_pages_partial_failures_emit_done_with_message(monkeypatch) -> None:
    pipeline_cmd = _patch_lighthouse_on_pages_db(monkeypatch)
    done_messages: list[str | None] = []
    monkeypatch.setattr(
        pipeline_cmd,
        "emit_phase_done",
        lambda phase, message=None: done_messages.append(message),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(
            run_lighthouse_on_pages=lambda **_k: {"attempted": 2, "succeeded": 1, "failed": 1},
        ),
    )
    pipeline_cmd._run_lighthouse_on_pages({}, lighthouse_max_pages=5)
    assert done_messages == ["Lighthouse complete with 1 failure(s)"]


def test_is_2xx_status_branches() -> None:
    from website_profiling.commands import pipeline_cmd

    class RegexStatus:
        def __float__(self):
            raise ValueError("not numeric")

        def __str__(self) -> str:
            return "208"

    assert pipeline_cmd._is_2xx_status(None) is False
    assert pipeline_cmd._is_2xx_status(200.0) is True
    assert pipeline_cmd._is_2xx_status(RegexStatus()) is True
    assert pipeline_cmd._is_2xx_status(object()) is False


def test_cfg_int_returns_default_when_get_int_none(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    monkeypatch.setattr(pipeline_cmd, "get_int", lambda _c, _k, _d: None)
    assert pipeline_cmd._cfg_int({}, "lighthouse_iterations", 3) == 3


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
        types.SimpleNamespace(
            run_lighthouse_on_pages=lambda urls, **_k: (
                urls_seen.setdefault("urls", urls),
                {"attempted": len(urls), "succeeded": len(urls), "failed": 0},
            )[1],
        ),
    )
    pipeline_cmd._run_lighthouse_on_pages({}, lighthouse_max_pages=5)
    assert urls_seen["urls"] == ["https://a.com"]


def test_pipeline_continues_to_report_when_lighthouse_fails(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    called = {"report": 0}

    monkeypatch.setattr(pipeline_cmd, "_run_crawl", lambda *_a, **_k: None)
    monkeypatch.setattr(
        pipeline_cmd,
        "_run_single_lighthouse",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("lighthouse boom")),
    )
    monkeypatch.setattr(pipeline_cmd, "_run_lighthouse_on_pages", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_plot", lambda *_a, **_k: None)
    monkeypatch.setattr(
        pipeline_cmd,
        "_run_report",
        lambda *_a, **_k: called.__setitem__("report", called["report"] + 1),
    )

    cfg = {
        "start_url": "https://site.com",
        "run_crawl": "false",
        "run_report": "true",
        "run_plot": "false",
        "run_lighthouse": "true",
        "run_lighthouse_on_pages": "false",
    }
    args = argparse.Namespace(command=None)

    pipeline_cmd.run(cfg, args)
    assert called["report"] == 1


def test_pipeline_exits_when_report_fails(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    monkeypatch.setattr(pipeline_cmd, "_run_crawl", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_single_lighthouse", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_lighthouse_on_pages", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_plot", lambda *_a, **_k: None)
    monkeypatch.setattr(
        pipeline_cmd,
        "_run_report",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("report boom")),
    )

    cfg = {
        "start_url": "https://site.com",
        "run_crawl": "false",
        "run_report": "true",
        "run_plot": "false",
        "run_lighthouse": "false",
        "run_lighthouse_on_pages": "false",
    }
    args = argparse.Namespace(command=None)

    with pytest.raises(SystemExit) as exc:
        pipeline_cmd.run(cfg, args)
    assert exc.value.code == 1


def test_finalize_pipeline_run_warns_on_optional_failure() -> None:
    from website_profiling.commands import pipeline_cmd

    pipeline_cmd._finalize_pipeline_run(
        [
            pipeline_cmd.PhaseResult("lighthouse", "failed", error="boom"),
            pipeline_cmd.PhaseResult("report", "ok"),
        ]
    )


def test_finalize_pipeline_run_exits_on_critical_failure() -> None:
    from website_profiling.commands import pipeline_cmd

    with pytest.raises(SystemExit) as exc:
        pipeline_cmd._finalize_pipeline_run(
            [
                pipeline_cmd.PhaseResult("crawl", "failed", error="boom"),
                pipeline_cmd.PhaseResult("report", "ok"),
            ]
        )
    assert exc.value.code == 1


def test_lighthouse_main_prints_unicode_summary_on_cp1252(monkeypatch, tmp_path) -> None:
    from website_profiling.lighthouse import runner as lh_runner

    summary = {
        "human_summary": "LCP meets good threshold (≤2500ms).",
        "human_summary_full": "LCP meets good threshold (≤2500ms).",
        "raw_reports": [],
        "diagnostics": [],
        "median_metrics": {},
        "category_scores": {},
        "top_failures": [],
    }
    monkeypatch.setattr(lh_runner, "run_lighthouse_audit", lambda **_k: summary)
    monkeypatch.setattr(lh_runner, "_build_report_html_content", lambda _s: "<html></html>")

    buffer = io.BytesIO()
    stream = io.TextIOWrapper(buffer, encoding="cp1252", errors="strict")
    monkeypatch.setattr(sys, "stdout", stream)

    code = lh_runner.main(
        url="https://example.com",
        output_dir=str(tmp_path),
        use_database=False,
        iterations=1,
    )
    assert code == 0
    output = buffer.getvalue().decode("utf-8", errors="replace")
    assert "2500" in output

