import argparse
from unittest.mock import patch

import pytest


def test_resolve_config_uses_explicit_file(tmp_path) -> None:
    from website_profiling.commands.config_resolve import resolve_config

    p = tmp_path / "c.txt"
    p.write_text("start_url = https://x.com\n", encoding="utf-8")
    args = argparse.Namespace(config=str(p))
    cfg, cwd = resolve_config(args)
    assert cfg["start_url"] == "https://x.com"
    assert cwd == str(tmp_path)


def test_make_path_fn_makes_absolute(tmp_path) -> None:
    from website_profiling.commands.config_resolve import make_path_fn

    cfg = {"p": "rel.txt"}
    fn = make_path_fn(cfg, str(tmp_path))
    assert fn("p", "x").startswith(str(tmp_path))


def test_should_enrich_keywords_after_report_prefers_explicit_flag() -> None:
    from website_profiling.commands.config_resolve import should_enrich_keywords_after_report

    assert should_enrich_keywords_after_report({"enrich_keywords_after_report": "true"}) is True
    assert should_enrich_keywords_after_report({"enrich_keywords_after_report": "false", "enable_google_search_console": "true"}) is False


def test_resolved_lighthouse_url_falls_back_to_start_url() -> None:
    from website_profiling.commands.config_resolve import resolved_lighthouse_url

    assert resolved_lighthouse_url({"start_url": "https://x.com"}) == "https://x.com"
    assert resolved_lighthouse_url({"lighthouse_url": "https://lh.com", "start_url": "https://x.com"}) == "https://lh.com"


def test_active_property_id_from_env(monkeypatch) -> None:
    from website_profiling.commands import config_resolve

    monkeypatch.delenv("WP_PROPERTY_ID", raising=False)
    monkeypatch.setenv("WP_PROPERTY_ID", "12")
    assert config_resolve.active_property_id_from_cfg({}) == 12
    assert config_resolve.active_property_id_from_cfg({"active_property_id": "3"}) == 12
    monkeypatch.delenv("WP_PROPERTY_ID", raising=False)
    assert config_resolve.active_property_id_from_cfg({"active_property_id": "3"}) == 3
    assert config_resolve.active_property_id_from_cfg({"active_property_id": "bad"}) is None
    assert config_resolve.active_property_id_from_cfg({"active_property_id": "0"}) is None


def test_apply_property_spawn_overlay(monkeypatch) -> None:
    from website_profiling.commands import config_resolve

    monkeypatch.setenv("WP_PROPERTY_ID", "7")

    class Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, *_):
            return False

    with patch("website_profiling.db.db_session", lambda: Ctx()):
        with patch(
            "website_profiling.db.property_store.get_property_by_id",
            return_value={
                "id": 7,
                "site_url": "https://spawned.example.com",
                "default_crawl_preset": "spa",
            },
        ):
            merged = config_resolve.apply_property_spawn_overlay({"max_pages": "50"})
    assert merged["active_property_id"] == "7"
    assert merged["start_url"] == "https://spawned.example.com"
    assert merged["crawl_render_mode"] == "auto"


def test_resolve_property_id_from_cfg_no_start_url() -> None:
    from website_profiling.commands import config_resolve

    assert config_resolve.resolve_property_id_from_cfg({"start_url": ""}) is None


def test_require_lighthouse_url_exits_when_missing() -> None:
    from website_profiling.commands import config_resolve

    with pytest.raises(SystemExit) as e:
        config_resolve.require_lighthouse_url({})
    assert e.value.code == 1


def test_require_start_url_exits_when_missing() -> None:
    from website_profiling.commands import config_resolve

    with pytest.raises(SystemExit) as e:
        config_resolve.require_start_url({}, for_step="crawl")
    assert e.value.code == 1


def test_google_db_has_gsc_false_on_db_error(monkeypatch) -> None:
    from website_profiling.commands import config_resolve

    def _boom():
        raise OSError("no db")

    monkeypatch.setattr("website_profiling.db.db_session", _boom)
    assert config_resolve.google_db_has_gsc({}) is False


def test_resolve_property_id_from_cfg_prefers_active_id(monkeypatch) -> None:
    from website_profiling.commands import config_resolve

    monkeypatch.delenv("WP_PROPERTY_ID", raising=False)
    assert config_resolve.resolve_property_id_from_cfg({"active_property_id": "7", "start_url": "https://a.com"}) == 7


def test_resolve_property_id_from_cfg_opens_db_session(monkeypatch) -> None:
    from website_profiling.commands import config_resolve

    monkeypatch.delenv("WP_PROPERTY_ID", raising=False)

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr("website_profiling.db.db_session", lambda: _Ctx())
    monkeypatch.setattr(
        "website_profiling.db.property_store.get_property_by_domain",
        lambda _c, domain: {"id": 11} if domain == "a.com" else None,
    )
    pid = config_resolve.resolve_property_id_from_cfg({"start_url": "https://a.com"})
    assert pid == 11


def test_google_db_has_gsc_false_when_missing_or_empty(monkeypatch) -> None:
    from tests.db_test_fakes import FakeConn, FakeCursor
    from website_profiling.commands import config_resolve

    holder: dict = {"conn": FakeConn()}
    holder["conn"].set_next_cursor(FakeCursor(fetchone_value=None))

    class _Ctx:
        def __enter__(self):
            return holder["conn"]

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr("website_profiling.db.db_session", lambda: _Ctx())
    assert config_resolve.google_db_has_gsc({}) is False

    holder["conn"] = FakeConn()
    holder["conn"].set_next_cursor(FakeCursor(fetchone_value={"data": {"gsc": {}}}))
    assert config_resolve.google_db_has_gsc({}) is False


def test_google_db_has_gsc_true_when_by_page_present(monkeypatch) -> None:
    from tests.db_test_fakes import FakeConn, FakeCursor
    from website_profiling.commands import config_resolve

    class _Ctx:
        def __enter__(self):
            return conn

        def __exit__(self, _t, _v, _tb):
            return False

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(fetchone_value={"data": {"gsc_full": {"by_page": {"https://x/": {}}}}})
    )
    monkeypatch.setattr("website_profiling.db.db_session", lambda: _Ctx())
    assert config_resolve.google_db_has_gsc({}) is True


def test_google_db_has_gsc_true_when_queries_present(monkeypatch) -> None:
    from tests.db_test_fakes import FakeConn, FakeCursor
    from website_profiling.commands import config_resolve

    class _Ctx:
        def __enter__(self):
            return conn

        def __exit__(self, _t, _v, _tb):
            return False

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(fetchone_value={"data": {"gsc": {"top_queries": [{"q": "x"}]}}})
    )
    monkeypatch.setattr("website_profiling.db.db_session", lambda: _Ctx())
    assert config_resolve.google_db_has_gsc({"active_property_id": "3"}) is True


def test_resolve_property_id_from_cfg_uses_start_url_domain(monkeypatch) -> None:
    from website_profiling.commands import config_resolve

    monkeypatch.delenv("WP_PROPERTY_ID", raising=False)

    class _Conn:
        pass

    monkeypatch.setattr(
        "website_profiling.db.property_store.get_property_by_domain",
        lambda _c, domain: {"id": 9} if domain == "codefrydev.in" else None,
    )
    pid = config_resolve.resolve_property_id_from_cfg(
        {"start_url": "https://codefrydev.in"},
        conn=_Conn(),
    )
    assert pid == 9


def test_google_cmd_passes_resolved_property_to_fetch(monkeypatch) -> None:
    from website_profiling.commands import google_cmd

    captured: dict = {}

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    def fake_fetch(**kwargs):
        captured.update(kwargs)
        return {"errors": []}

    monkeypatch.delenv("WP_PROPERTY_ID", raising=False)
    monkeypatch.setattr(google_cmd, "resolve_property_id_from_cfg", lambda _cfg: 3)
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.fetch",
        __import__("types").SimpleNamespace(fetch_google_data=fake_fetch, list_properties=lambda *_a, **_k: {}),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.store",
        __import__("types").SimpleNamespace(write_google_data=lambda *_a, **_k: None),
    )
    import types as _types
    import sys as _sys

    google_mod = _types.ModuleType("google")
    auth_mod = _types.ModuleType("google.auth")
    exc_mod = _types.ModuleType("google.auth.exceptions")
    exc_mod.RefreshError = RuntimeError
    auth_mod.exceptions = exc_mod
    google_mod.auth = auth_mod
    monkeypatch.setitem(_sys.modules, "google", google_mod)
    monkeypatch.setitem(_sys.modules, "google.auth", auth_mod)
    monkeypatch.setitem(_sys.modules, "google.auth.exceptions", exc_mod)
    import website_profiling.db as db

    monkeypatch.setattr(db, "db_session", lambda: _Ctx())
    monkeypatch.setattr(db, "get_latest_crawl_run_id", lambda _c: None)
    monkeypatch.setattr(db, "read_crawl", lambda _c, _rid: __import__("pandas").DataFrame())

    with pytest.raises(SystemExit) as e:
        google_cmd.run(
            {"start_url": "https://codefrydev.in"},
            cwd="/tmp",
            path=lambda _k, d: d,
            args=argparse.Namespace(list_properties=False, test=False, property_id=None),
        )
    assert e.value.code == 0
    assert captured.get("property_id") == 3

