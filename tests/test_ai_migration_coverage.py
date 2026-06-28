"""Coverage for AiService migration stubs and HTTP bridge call sites."""
from __future__ import annotations

import argparse
import io
import json
import types
import urllib.error
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest


def test_google_cmd_integrations_fetch_error_exits(monkeypatch, capsys) -> None:
    from website_profiling.commands import google_cmd

    monkeypatch.setenv("INTEGRATIONS_SERVICE_URL", "http://integrations:8093")
    monkeypatch.setattr(google_cmd, "resolve_property_id_from_cfg", lambda _c: 2)
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.db",
        types.SimpleNamespace(
            db_session=lambda: types.SimpleNamespace(__enter__=lambda s: object(), __exit__=lambda *a: None),
            get_latest_crawl_run_id=lambda _c: None,
            read_crawl=lambda *_a, **_k: pd.DataFrame(),
        ),
    )
    monkeypatch.setattr(
        google_cmd,
        "_fetch_via_integrations",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("fetch failed")),
    )
    args = argparse.Namespace(list_properties=False, test=False, property_id=2)
    with pytest.raises(SystemExit) as exc:
        google_cmd.run({"start_url": "https://ex.com"}, "/tmp", lambda _k, d: d, args)
    assert exc.value.code == 1
    assert "fetch failed" in capsys.readouterr().err


def test_google_cmd_run_test_via_integrations(monkeypatch, capsys) -> None:
    from website_profiling.commands import google_cmd

    monkeypatch.setenv("INTEGRATIONS_SERVICE_URL", "http://integrations:8093")

    class _Resp:
        def read(self):
            return json.dumps({"ok": True, "log": "connected", "exitCode": 0}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    with patch("urllib.request.urlopen", return_value=_Resp()):
        with pytest.raises(SystemExit) as exc:
            google_cmd._run_google_test(4)
    assert exc.value.code == 0
    assert "connected" in capsys.readouterr().out


def test_google_cmd_run_test_integrations_http_error(monkeypatch, capsys) -> None:
    from website_profiling.commands import google_cmd

    monkeypatch.setenv("INTEGRATIONS_SERVICE_URL", "http://integrations:8093")
    err = urllib.error.HTTPError(
        url="http://integrations:8093/api/properties/4/google/test",
        code=502,
        msg="bad",
        hdrs={},
        fp=io.BytesIO(b"upstream down"),
    )
    with patch("urllib.request.urlopen", side_effect=err):
        with pytest.raises(SystemExit) as exc:
            google_cmd._run_google_test(4)
    assert exc.value.code == 1
    assert "upstream down" in capsys.readouterr().err


def test_google_cmd_run_test_integrations_generic_error(monkeypatch, capsys) -> None:
    from website_profiling.commands import google_cmd

    monkeypatch.setenv("INTEGRATIONS_SERVICE_URL", "http://integrations:8093")
    with patch("urllib.request.urlopen", side_effect=RuntimeError("socket down")):
        with pytest.raises(SystemExit) as exc:
            google_cmd._run_google_test(4)
    assert exc.value.code == 1
    assert "socket down" in capsys.readouterr().err


def test_google_cmd_integrations_http_helpers(monkeypatch) -> None:
    from website_profiling.commands import google_cmd

    monkeypatch.setenv("INTEGRATIONS_SERVICE_URL", "http://integrations:8093")

    class _Resp:
        def __init__(self, payload: dict):
            self._payload = payload

        def read(self):
            return json.dumps(self._payload).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    with patch("urllib.request.urlopen", return_value=_Resp({"gsc": {}})):
        out = google_cmd._fetch_via_integrations(
            "http://integrations:8093",
            property_id=1,
            date_range_days=28,
            crawl_urls=[],
            start_url="https://ex.com",
            config={},
        )
    assert out == {"gsc": {}}

    err = urllib.error.HTTPError("http://x", 500, "bad", {}, io.BytesIO(b"boom"))
    with patch("urllib.request.urlopen", side_effect=err):
        with pytest.raises(RuntimeError, match="boom"):
            google_cmd._fetch_via_integrations(
                "http://integrations:8093",
                property_id=1,
                date_range_days=28,
                crawl_urls=[],
                start_url="https://ex.com",
                config={},
            )

    with patch("urllib.request.urlopen", return_value=_Resp({"properties": []})):
        listed = google_cmd._list_properties_via_integrations(1)
    assert listed == {"properties": []}

    list_err = urllib.error.HTTPError("http://x", 500, "bad", {}, io.BytesIO(b"list boom"))
    with patch("urllib.request.urlopen", side_effect=list_err):
        with pytest.raises(RuntimeError, match="list boom"):
            google_cmd._list_properties_via_integrations(1)


def test_pipeline_keyword_enrich_via_integrations(monkeypatch, capsys) -> None:
    from website_profiling.commands import pipeline_cmd, report_build

    monkeypatch.setenv("INTEGRATIONS_SERVICE_URL", "http://integrations:8093")
    monkeypatch.delenv("REPORT_SERVICE_URL", raising=False)
    monkeypatch.setattr(report_build, "console_print", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "emit_phase_start", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "emit_phase_done", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "emit_progress", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "require_start_url", lambda *_a, **_k: "https://ex.com")
    monkeypatch.setattr(report_build, "should_enrich_keywords_after_report", lambda _c: True)
    monkeypatch.setattr(report_build, "google_db_has_gsc", lambda _c: True)
    monkeypatch.setattr(report_build, "active_property_id_from_cfg", lambda _c: 9)
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.reporting.builder",
        types.SimpleNamespace(run_simple_report=lambda **_k: "/tmp/report.json"),
    )

    class _Resp:
        def read(self):
            return json.dumps({"ok": True}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    with patch("urllib.request.urlopen", return_value=_Resp()):
        pipeline_cmd._run_report({"start_url": "https://ex.com"}, use_database=True)
    assert "falling back" not in capsys.readouterr().err


def test_pipeline_lighthouse_info_exception_swallowed(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    monkeypatch.setattr(pipeline_cmd, "console_print", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "emit_phase_start", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "emit_progress", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "lighthouse_work_dir", lambda: "/tmp/lh")
    monkeypatch.setattr(pipeline_cmd, "active_property_id_from_cfg", lambda _c: 1)
    monkeypatch.setattr(pipeline_cmd, "select_lighthouse_urls_from_crawl", lambda *_a, **_k: [])
    monkeypatch.setattr(pipeline_cmd, "select_lighthouse_urls_from_gsc", lambda *_a, **_k: [])
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(run_lighthouse_on_pages=lambda **_k: {}),
    )

    conn = MagicMock()

    def db_session():
        cm = MagicMock()
        cm.__enter__.return_value = conn
        cm.__exit__.return_value = False
        return cm

    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.db",
        types.SimpleNamespace(
            db_session=db_session,
            resolve_crawl_run_id_for_cfg=lambda *_a, **_k: 5,
            read_crawl=lambda *_a, **_k: pd.DataFrame([{"url": "https://ex.com", "status": "200"}]),
            get_crawl_run_info=lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("no info")),
        ),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.store",
        types.SimpleNamespace(read_latest_google_data=lambda *_a, **_k: None),
    )
    pipeline_cmd._run_lighthouse_on_pages(
        {"lighthouse_strategy": "mobile", "start_url": "https://ex.com"},
        lighthouse_max_pages=1,
        crawl_run_id=5,
    )


def test_ai_suggest_cache_roundtrip() -> None:
    from website_profiling.content_studio.ai_suggest import _read_cache, _write_cache

    conn = MagicMock()
    with patch("website_profiling.db.db_session") as mock_db:
        mock_db.return_value.__enter__.return_value = conn
        with patch(
            "website_profiling.content_studio.ai_suggest.read_llm_cache",
            return_value='{"ai_block":{"summary":"cached"}}',
        ):
            assert _read_cache("key") == {"ai_block": {"summary": "cached"}}
        with patch(
            "website_profiling.content_studio.ai_suggest.read_llm_cache",
            return_value="not-json",
        ):
            assert _read_cache("bad") is None
        with patch("website_profiling.content_studio.ai_suggest.write_llm_cache") as mock_write:
            _write_cache("key", {"ai_block": {"summary": "x"}})
            mock_write.assert_called_once()


def test_ai_suggest_call_ai_api_error_path() -> None:
    from website_profiling.content_studio.ai_suggest import analyze_content_draft

    cfg = {"llm_enabled": True, "llm_provider": "openai", "llm_enable_content_studio": "true"}
    with patch("website_profiling.content_studio.ai_suggest.load_llm_config_from_db", return_value=cfg), patch(
        "website_profiling.content_studio.ai_suggest._read_cache",
        return_value=None,
    ), patch(
        "website_profiling.content_studio.ai_suggest.call_ai_api",
        side_effect=RuntimeError("offline"),
    ):
        result = analyze_content_draft(None, "best crm", "<p>best crm</p>", use_ai=True, refresh=True)
    assert result["ai_error"] == "offline"


def test_content_studio_openai_tools_schema() -> None:
    from website_profiling.content_studio.tools import openai_tools_schema

    schema = openai_tools_schema()
    assert schema and schema[0]["type"] == "function"


def test_strip_surrogates_empty_string() -> None:
    from website_profiling.text_sanitize import strip_surrogates

    assert strip_surrogates("") == ""


def test_sanitize_unicode_deep_tuple_branch() -> None:
    from website_profiling.text_sanitize import sanitize_unicode_deep

    out = sanitize_unicode_deep(("a\udc9d",))
    assert isinstance(out, tuple)
    assert "\udc9d" not in out[0]


def test_crawl_store_start_url_helpers() -> None:
    from website_profiling.db import crawl_store as cs

    assert cs._normalize_start_url_key("") == ""
    assert cs._normalize_start_url_key("ex.com").endswith("ex.com")
    assert cs._normalize_start_url_key("https://Ex.Com/") == "https://ex.com"

    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {"id": 9}
    assert cs.get_latest_crawl_run_id_for_property(conn, 1) == 9

    conn.execute.return_value.fetchall.return_value = [
        {"id": 3, "start_url": "https://ex.com/"},
        {"id": 2, "start_url": "https://other.com"},
    ]
    assert cs.get_latest_crawl_run_id_for_start_url(conn, "https://ex.com") == 3
    assert cs.get_latest_crawl_run_id_for_start_url(conn, "") is None

    conn.execute.side_effect = None
    conn.execute.return_value.fetchall.return_value = [
        {"id": 2, "start_url": "https://other.com"},
    ]
    assert cs.get_latest_crawl_run_id_for_start_url(conn, "https://ex.com") is None

    conn.execute.side_effect = RuntimeError("db")
    assert cs.get_latest_crawl_run_id_for_property(conn, 1) is None
    assert cs.get_latest_crawl_run_id_for_start_url(conn, "https://ex.com") is None


def test_property_store_domain_validation_and_google_status() -> None:
    from website_profiling.db import property_store as ps

    assert ps.is_valid_canonical_domain("http") is False
    assert ps.is_valid_canonical_domain("ex.i") is False
    assert ps.is_valid_canonical_domain("-bad.com") is False
    assert ps.is_valid_canonical_domain("nodot") is False

    conn = MagicMock()
    with pytest.raises(ValueError, match="not a valid domain"):
        ps.upsert_property_by_domain(conn, "Ex", "ex.i")

    with patch(
        "website_profiling.db.property_store.get_property_by_id",
        return_value={"google_connected_at": "2026-01-01", "google_date_range_days": 0},
    ):
        status = ps.get_property_google_public_status(conn, 1)
    assert status["connected"] is True
    assert status["dateRangeDays"] == 28

    with patch(
        "website_profiling.db.property_store.get_property_by_domain",
        return_value={"id": 42},
    ):
        assert ps.ensure_property_from_start_url(conn, "https://ex.com") == 42


def test_pipeline_keyword_enrich_rejects_failed_response(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd, report_build

    monkeypatch.setenv("INTEGRATIONS_SERVICE_URL", "http://integrations:8093")
    monkeypatch.delenv("REPORT_SERVICE_URL", raising=False)
    monkeypatch.setattr(report_build, "console_print", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "emit_phase_start", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "emit_phase_done", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "emit_progress", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "require_start_url", lambda *_a, **_k: "https://ex.com")
    monkeypatch.setattr(report_build, "active_property_id_from_cfg", lambda _c: 9)
    monkeypatch.setattr(report_build, "google_db_has_gsc", lambda _c: True)
    monkeypatch.setattr(report_build, "should_enrich_keywords_after_report", lambda _c: True)
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.reporting.builder",
        types.SimpleNamespace(run_simple_report=lambda **_k: "/tmp/report.json"),
    )

    class _Resp:
        def read(self):
            return json.dumps({"ok": False, "log": "nope"}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    with patch("urllib.request.urlopen", return_value=_Resp()):
        pipeline_cmd._run_report(
            {"start_url": "https://ex.com", "enable_google_search_console": True},
            use_database=True,
        )

    with patch("urllib.request.urlopen", side_effect=RuntimeError("down")):
        pipeline_cmd._run_report(
            {"start_url": "https://ex.com", "enable_google_search_console": True},
            use_database=True,
        )


def test_report_build_service_and_bridge_helpers(monkeypatch) -> None:
    from website_profiling.commands import report_build

    conn = MagicMock()
    with patch(
        "website_profiling.db.config_store.read_pipeline_config",
        return_value=({"k": "v"}, []),
    ):
        cfg = report_build.load_config_for_property(conn, 5, 9, {"x": "y"})
    assert cfg["active_property_id"] == "5"
    assert cfg["_bridge_crawl_run_id"] == "9"
    assert cfg["x"] == "y"

    monkeypatch.delenv("REPORT_SERVICE_URL", raising=False)
    with pytest.raises(RuntimeError, match="REPORT_SERVICE_URL is not set"):
        report_build.call_report_service({}, 1)

    monkeypatch.setenv("REPORT_SERVICE_URL", "http://report:8094")

    class _Resp:
        def read(self):
            return json.dumps({"ok": True, "outputPath": "/data/out.json"}).encode()

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    with patch("urllib.request.urlopen", return_value=_Resp()):
        out = report_build.call_report_service({"a": "1"}, 3, 7)
    assert out["ok"] is True

    http_err = urllib.error.HTTPError("http://x", 502, "bad", {}, io.BytesIO(b"detail"))
    with patch("urllib.request.urlopen", side_effect=http_err):
        with pytest.raises(RuntimeError, match="502"):
            report_build.call_report_service({}, 1)

    url_err = urllib.error.URLError("connection refused")
    with patch("urllib.request.urlopen", side_effect=url_err):
        with pytest.raises(ConnectionError):
            report_build.call_report_service({}, 1)

    monkeypatch.setenv("FASTAPI_URL", "http://fastapi:8096")
    with patch("urllib.request.urlopen", return_value=_Resp()):
        out2 = report_build.call_fastapi_report_bridge({"a": "1"}, 3)
    assert out2["ok"] is True

    bridge_err = urllib.error.HTTPError("http://x", 500, "bad", {}, io.BytesIO(b"bridge fail"))
    with patch("urllib.request.urlopen", side_effect=bridge_err):
        with pytest.raises(RuntimeError, match="bridge fail"):
            report_build.call_fastapi_report_bridge({}, 1)

    monkeypatch.setattr(report_build, "execute_report_build", lambda *_a, **_k: "local.json")
    with patch("urllib.request.urlopen", return_value=_Resp()):
        assert report_build.build_report_resilient({"a": "1"}, 3) == "/data/out.json"

    fail_resp = _Resp()
    fail_resp.read = lambda: json.dumps({"ok": False, "log": "build failed"}).encode()

    with patch("urllib.request.urlopen", return_value=fail_resp):
        with pytest.raises(RuntimeError, match="build failed"):
            report_build.build_report_resilient({"a": "1"}, 3)

    calls = {"n": 0}

    def urlopen_side_effect(*_a, **_k):
        calls["n"] += 1
        if calls["n"] == 1:
            raise urllib.error.URLError("report down")
        raise RuntimeError("bridge boom")

    with patch("urllib.request.urlopen", side_effect=urlopen_side_effect):
        assert report_build.build_report_resilient({"a": "1"}, 3) == "local.json"


def test_pipeline_run_report_via_report_service(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd, report_build

    monkeypatch.setenv("REPORT_SERVICE_URL", "http://report:8094")
    monkeypatch.setattr(pipeline_cmd, "active_property_id_from_cfg", lambda _c: "1")
    monkeypatch.setattr(pipeline_cmd, "console_print", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "emit_phase_start", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "emit_phase_done", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "build_report_resilient", lambda *_a, **_k: "/out.json")
    pipeline_cmd._run_report({"active_property_id": "1"}, True)


def test_pipeline_run_report_service_failure_emits_error(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd, report_build

    monkeypatch.setenv("REPORT_SERVICE_URL", "http://report:8094")
    monkeypatch.setattr(pipeline_cmd, "active_property_id_from_cfg", lambda _c: "1")
    monkeypatch.setattr(pipeline_cmd, "console_print", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "emit_phase_start", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "emit_phase_done", lambda *_a, **_k: None)
    progress = []
    monkeypatch.setattr(pipeline_cmd, "emit_progress", lambda *a, **k: progress.append((a, k)))
    monkeypatch.setattr(
        report_build,
        "build_report_resilient",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("boom")),
    )

    with pytest.raises(RuntimeError, match="boom"):
        pipeline_cmd._run_report({"active_property_id": "1"}, True)
    assert progress and progress[-1][0][0] == "report"


def test_ai_suggest_cache_empty_raw() -> None:
    from website_profiling.content_studio.ai_suggest import _read_cache

    conn = MagicMock()
    with patch("website_profiling.db.db_session") as mock_db:
        mock_db.return_value.__enter__.return_value = conn
        with patch("website_profiling.content_studio.ai_suggest.read_llm_cache", return_value=""):
            assert _read_cache("key") is None
