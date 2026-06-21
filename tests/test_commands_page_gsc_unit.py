from __future__ import annotations

import argparse
import json
import sys
import types
from contextlib import contextmanager
from pathlib import Path

import pandas as pd
import pytest


@contextmanager
def _fake_db_session(conn=None):
    yield conn or object()


def test_gsc_links_cmd_missing_property_id(monkeypatch, capsys) -> None:
    from website_profiling.commands import gsc_links_cmd

    monkeypatch.setattr(
        "website_profiling.commands.config_resolve.resolve_property_id_from_cfg",
        lambda _cfg: None,
    )
    args = argparse.Namespace(property_id=None, status=False)
    with pytest.raises(SystemExit) as exc:
        gsc_links_cmd.run({}, args)
    assert exc.value.code == 1
    assert "property-id" in capsys.readouterr().err.lower()


def test_gsc_links_cmd_status(monkeypatch, capsys) -> None:
    from website_profiling.commands import gsc_links_cmd

    fake_store = types.SimpleNamespace(
        read_gsc_links_status=lambda _conn, pid: {"property_id": pid, "has_data": True},
        import_gsc_links_csv=None,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.gsc_links_store",
        fake_store,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.db",
        types.SimpleNamespace(
            db_session=_fake_db_session,
            get_latest_crawl_run_id=None,
            read_crawl=None,
        ),
    )

    args = argparse.Namespace(property_id="42", status=True)
    with pytest.raises(SystemExit) as exc:
        gsc_links_cmd.run({}, args)
    assert exc.value.code == 0
    out = json.loads(capsys.readouterr().out)
    assert out["property_id"] == 42


def test_gsc_links_cmd_csv_file_import(monkeypatch, capsys, tmp_path: Path) -> None:
    from website_profiling.commands import gsc_links_cmd

    csv_path = tmp_path / "links.csv"
    csv_path.write_text("Source,Target\nhttps://a.com,https://b.com\n", encoding="utf-8")

    captured: dict = {}

    def fake_import(_conn, pid, csv_text, *, crawl_urls=None, file_name=""):
        captured["pid"] = pid
        captured["csv"] = csv_text
        captured["crawl_urls"] = crawl_urls
        captured["file_name"] = file_name
        return {"ok": True, "rows": 1}

    fake_store = types.SimpleNamespace(
        import_gsc_links_csv=fake_import,
        read_gsc_links_status=None,
    )
    df = pd.DataFrame({"url": ["https://c.com/", ""]})

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.gsc_links_store",
        fake_store,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.db",
        types.SimpleNamespace(
            db_session=_fake_db_session,
            get_latest_crawl_run_id=lambda _c: 9,
            read_crawl=lambda _c, _rid: df,
        ),
    )

    args = argparse.Namespace(
        property_id="7",
        status=False,
        csv_stdin=False,
        csv_file=str(csv_path),
        file_name="links.csv",
    )
    with pytest.raises(SystemExit) as exc:
        gsc_links_cmd.run({}, args)
    assert exc.value.code == 0
    assert captured["pid"] == 7
    assert "https://a.com" in captured["csv"]
    assert captured["crawl_urls"] == ["https://c.com/", ""]
    out = json.loads(capsys.readouterr().out)
    assert out["ok"] is True


def test_gsc_links_cmd_csv_stdin(monkeypatch, capsys) -> None:
    from website_profiling.commands import gsc_links_cmd

    fake_store = types.SimpleNamespace(
        import_gsc_links_csv=lambda *_a, **_k: {"ok": True},
        read_gsc_links_status=None,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.gsc_links_store",
        fake_store,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.db",
        types.SimpleNamespace(
            db_session=_fake_db_session,
            get_latest_crawl_run_id=lambda _c: None,
            read_crawl=None,
        ),
    )
    monkeypatch.setattr("sys.stdin", types.SimpleNamespace(read=lambda: "a,b\n"))

    args = argparse.Namespace(
        property_id="1",
        status=False,
        csv_stdin=True,
        csv_file=None,
        file_name="",
    )
    with pytest.raises(SystemExit) as exc:
        gsc_links_cmd.run({}, args)
    assert exc.value.code == 0


def test_gsc_links_cmd_missing_csv_source(monkeypatch, capsys) -> None:
    from website_profiling.commands import gsc_links_cmd

    args = argparse.Namespace(
        property_id="1",
        status=False,
        csv_stdin=False,
        csv_file=None,
        file_name="",
    )
    with pytest.raises(SystemExit) as exc:
        gsc_links_cmd.run({}, args)
    assert exc.value.code == 1
    assert "csv" in capsys.readouterr().err.lower()


def test_gsc_links_cmd_crawl_enrichment_exception_swallowed(monkeypatch, capsys) -> None:
    from website_profiling.commands import gsc_links_cmd

    session_calls = {"n": 0}

    @contextmanager
    def flaky_session():
        session_calls["n"] += 1
        if session_calls["n"] == 1:
            raise RuntimeError("db down")
        yield object()

    fake_store = types.SimpleNamespace(
        import_gsc_links_csv=lambda *_a, **_k: {"ok": True, "crawl_urls": []},
        read_gsc_links_status=None,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.gsc_links_store",
        fake_store,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.db",
        types.SimpleNamespace(
            db_session=flaky_session,
            get_latest_crawl_run_id=lambda _c: 1,
            read_crawl=lambda _c, _rid: pd.DataFrame(),
        ),
    )

    args = argparse.Namespace(
        property_id="3",
        status=False,
        csv_stdin=True,
        csv_file=None,
        file_name="",
    )
    monkeypatch.setattr("sys.stdin", types.SimpleNamespace(read=lambda: "x"))
    with pytest.raises(SystemExit) as exc:
        gsc_links_cmd.run({}, args)
    assert exc.value.code == 0


def test_gsc_links_cmd_value_error(monkeypatch, capsys) -> None:
    from website_profiling.commands import gsc_links_cmd

    def raise_value(*_a, **_k):
        raise ValueError("bad csv")

    fake_store = types.SimpleNamespace(
        import_gsc_links_csv=raise_value,
        read_gsc_links_status=None,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.gsc_links_store",
        fake_store,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.db",
        types.SimpleNamespace(
            db_session=_fake_db_session,
            get_latest_crawl_run_id=lambda _c: None,
            read_crawl=None,
        ),
    )
    monkeypatch.setattr("sys.stdin", types.SimpleNamespace(read=lambda: "bad"))

    args = argparse.Namespace(
        property_id="1",
        status=False,
        csv_stdin=True,
        csv_file=None,
        file_name="",
    )
    with pytest.raises(SystemExit) as exc:
        gsc_links_cmd.run({}, args)
    assert exc.value.code == 1
    out = json.loads(capsys.readouterr().out)
    assert out["ok"] is False
    assert "bad csv" in out["error"]


def test_gsc_links_cmd_generic_exception(monkeypatch, capsys) -> None:
    from website_profiling.commands import gsc_links_cmd

    def raise_other(*_a, **_k):
        raise RuntimeError("boom")

    fake_store = types.SimpleNamespace(
        import_gsc_links_csv=raise_other,
        read_gsc_links_status=None,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.gsc_links_store",
        fake_store,
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.db",
        types.SimpleNamespace(
            db_session=_fake_db_session,
            get_latest_crawl_run_id=lambda _c: None,
            read_crawl=None,
        ),
    )
    monkeypatch.setattr("sys.stdin", types.SimpleNamespace(read=lambda: "x"))

    args = argparse.Namespace(
        property_id="1",
        status=False,
        csv_stdin=True,
        csv_file=None,
        file_name="",
    )
    with pytest.raises(SystemExit) as exc:
        gsc_links_cmd.run({}, args)
    assert exc.value.code == 1
    out = json.loads(capsys.readouterr().out)
    assert "boom" in out["error"]


def test_page_coach_cmd_missing_url(capsys) -> None:
    from website_profiling.commands import page_coach_cmd

    args = argparse.Namespace(url="", refresh=False)
    with pytest.raises(SystemExit) as exc:
        page_coach_cmd.run({}, "/tmp", args)
    assert exc.value.code == 1
    assert "url" in capsys.readouterr().err.lower()


def test_page_coach_cmd_success_and_env(monkeypatch, capsys) -> None:
    from website_profiling.commands import page_coach_cmd

    captured: dict = {}

    def fake_run(url, cfg, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return {"ok": True, "suggestions": []}

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.llm.page_coach",
        types.SimpleNamespace(run_page_coach=fake_run),
    )
    monkeypatch.setenv("WP_PAGE_COACH_CURRENT", "crawl:5")
    monkeypatch.setenv("WP_PAGE_COACH_BASELINE", "crawl:2")

    args = argparse.Namespace(url="https://example.com/page", refresh=True)
    with pytest.raises(SystemExit) as exc:
        page_coach_cmd.run({"start_url": "https://example.com"}, "/tmp", args)
    assert exc.value.code == 0
    assert captured["url"] == "https://example.com/page"
    assert captured["kwargs"]["current_type"] == "crawl"
    assert captured["kwargs"]["current_id"] == 5
    assert captured["kwargs"]["baseline_type"] == "crawl"
    assert captured["kwargs"]["baseline_id"] == 2
    out = json.loads(capsys.readouterr().out)
    assert out["ok"] is True


def test_page_coach_cmd_malformed_env_does_not_crash(monkeypatch, capsys) -> None:
    # A non-numeric / empty id (e.g. from an unvalidated request body) must
    # degrade to None, not raise ValueError and crash the command.
    from website_profiling.commands import page_coach_cmd

    captured: dict = {}

    def fake_run(url, cfg, **kwargs):
        captured["kwargs"] = kwargs
        return {"ok": True, "suggestions": []}

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.llm.page_coach",
        types.SimpleNamespace(run_page_coach=fake_run),
    )
    monkeypatch.setenv("WP_PAGE_COACH_CURRENT", "live:abc")
    monkeypatch.setenv("WP_PAGE_COACH_BASELINE", "snapshot:")

    args = argparse.Namespace(url="https://example.com/page", refresh=False)
    with pytest.raises(SystemExit) as exc:
        page_coach_cmd.run({"start_url": "https://example.com"}, "/tmp", args)
    assert exc.value.code == 0
    assert captured["kwargs"]["current_type"] is None
    assert captured["kwargs"]["current_id"] is None
    assert captured["kwargs"]["baseline_id"] is None


def test_page_coach_cmd_failure_exit(monkeypatch, capsys) -> None:
    from website_profiling.commands import page_coach_cmd

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.llm.page_coach",
        types.SimpleNamespace(run_page_coach=lambda *_a, **_k: {"ok": False}),
    )
    monkeypatch.delenv("WP_PAGE_COACH_CURRENT", raising=False)
    monkeypatch.delenv("WP_PAGE_COACH_BASELINE", raising=False)

    args = argparse.Namespace(url="https://x.com", refresh=False)
    with pytest.raises(SystemExit) as exc:
        page_coach_cmd.run({}, "/tmp", args)
    assert exc.value.code == 1


def test_page_live_cmd_missing_url(capsys) -> None:
    from website_profiling.commands import page_live_cmd

    args = argparse.Namespace(url="  ", no_persist=False)
    with pytest.raises(SystemExit) as exc:
        page_live_cmd.run({}, "/tmp", args)
    assert exc.value.code == 1


def test_page_live_cmd_success(monkeypatch, capsys) -> None:
    from website_profiling.commands import page_live_cmd

    captured: dict = {}

    def fake_fetch(url, cfg, *, persist=True, property_id=None):
        captured["url"] = url
        captured["persist"] = persist
        captured["property_id"] = property_id
        return {"ok": True, "gsc": {"clicks": 1}}

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.page_live",
        types.SimpleNamespace(fetch_page_live=fake_fetch),
    )
    monkeypatch.setattr(
        "website_profiling.commands.config_resolve.resolve_property_id_from_cfg",
        lambda _cfg: 99,
    )

    args = argparse.Namespace(url="https://example.com/p", no_persist=False)
    with pytest.raises(SystemExit) as exc:
        page_live_cmd.run({"property_id": "99"}, "/tmp", args)
    assert exc.value.code == 0
    assert captured["persist"] is True
    assert captured["property_id"] == 99


def test_page_live_cmd_partial_ga4_exit_zero(monkeypatch, capsys) -> None:
    from website_profiling.commands import page_live_cmd

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.page_live",
        types.SimpleNamespace(
            fetch_page_live=lambda *_a, **_k: {"ok": False, "ga4": {"sessions": 3}}
        ),
    )
    monkeypatch.setattr(
        "website_profiling.commands.config_resolve.resolve_property_id_from_cfg",
        lambda _cfg: None,
    )

    args = argparse.Namespace(url="https://x.com", no_persist=True)
    with pytest.raises(SystemExit) as exc:
        page_live_cmd.run({}, "/tmp", args)
    assert exc.value.code == 0


def test_page_live_cmd_failure_exit(monkeypatch) -> None:
    from website_profiling.commands import page_live_cmd

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.page_live",
        types.SimpleNamespace(fetch_page_live=lambda *_a, **_k: {"ok": False}),
    )
    monkeypatch.setattr(
        "website_profiling.commands.config_resolve.resolve_property_id_from_cfg",
        lambda _cfg: None,
    )

    args = argparse.Namespace(url="https://x.com", no_persist=False)
    with pytest.raises(SystemExit) as exc:
        page_live_cmd.run({}, "/tmp", args)
    assert exc.value.code == 1


def test_page_live_cmd_exception(monkeypatch, capsys) -> None:
    from website_profiling.commands import page_live_cmd

    def boom(*_a, **_k):
        raise RuntimeError("api down")

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.page_live",
        types.SimpleNamespace(fetch_page_live=boom),
    )
    monkeypatch.setattr(
        "website_profiling.commands.config_resolve.resolve_property_id_from_cfg",
        lambda _cfg: 1,
    )

    args = argparse.Namespace(url="https://x.com", no_persist=False)
    with pytest.raises(SystemExit) as exc:
        page_live_cmd.run({}, "/tmp", args)
    assert exc.value.code == 1
    out = json.loads(capsys.readouterr().out)
    assert "api down" in out["error"]
