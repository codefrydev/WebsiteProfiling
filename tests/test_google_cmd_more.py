import argparse
import types

import pytest


def test_google_cmd_test_flag_calls_test(monkeypatch) -> None:
    from website_profiling.commands import google_cmd

    called = {"n": 0}

    def fake_run_test(_p, _pid=None):
        called["n"] += 1

    monkeypatch.setattr(google_cmd, "_run_google_test", fake_run_test)
    # Ensure imports inside run() don't blow up
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.auth",
        types.SimpleNamespace(
            build_credentials=lambda *_a, **_k: None,
            read_secrets=lambda *_a, **_k: {},
            resolve_google_targets=lambda *_a, **_k: ("", "", 28),
        ),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.fetch",
        types.SimpleNamespace(fetch_google_data=lambda *_a, **_k: {}, list_properties=lambda *_a, **_k: {}),
    )

    args = argparse.Namespace(list_properties=False, test=True, property_id=None)
    google_cmd.run({"google_credentials_path": "rel.json"}, cwd="/cwd", path=lambda k, d: d, args=args)
    assert called["n"] == 1


def test_google_cmd_list_properties_error_exits_1(monkeypatch) -> None:
    from website_profiling.commands import google_cmd

    def boom(_p=None):
        raise RuntimeError("nope")

    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.fetch",
        types.SimpleNamespace(list_properties=boom, fetch_google_data=None),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.auth",
        types.SimpleNamespace(
            build_credentials=lambda *_a, **_k: None,
            read_secrets=lambda *_a, **_k: {},
            resolve_google_targets=lambda *_a, **_k: ("", "", 28),
        ),
    )

    args = argparse.Namespace(list_properties=True, test=False, property_id=None)
    with pytest.raises(SystemExit) as e:
        google_cmd.run({"google_credentials_path": ""}, cwd="/tmp", path=lambda k, d: d, args=args)
    assert e.value.code == 1


def test_google_cmd_list_properties_via_integrations(monkeypatch, capsys) -> None:
    from website_profiling.commands import google_cmd

    monkeypatch.setenv("INTEGRATIONS_SERVICE_URL", "http://integrations:8093")
    monkeypatch.setattr(
        google_cmd,
        "_list_properties_via_integrations",
        lambda pid: {"properties": [{"id": pid}]},
    )
    args = argparse.Namespace(list_properties=True, test=False, property_id=7)
    with pytest.raises(SystemExit) as exc:
        google_cmd.run({}, "/tmp", lambda _k, d: d, args)
    assert exc.value.code == 0
    assert '"properties"' in capsys.readouterr().out


def test_google_cmd_fetch_via_integrations(monkeypatch, capsys) -> None:
    from website_profiling.commands import google_cmd

    monkeypatch.setenv("INTEGRATIONS_SERVICE_URL", "http://integrations:8093")
    monkeypatch.setattr(google_cmd, "resolve_property_id_from_cfg", lambda _c: 3)
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.db",
        types.SimpleNamespace(
            db_session=lambda: types.SimpleNamespace(__enter__=lambda s: object(), __exit__=lambda *a: None),
            get_latest_crawl_run_id=lambda _c: None,
            read_crawl=lambda *_a, **_k: __import__("pandas").DataFrame(),
        ),
    )
    monkeypatch.setattr(
        google_cmd,
        "_fetch_via_integrations",
        lambda *_a, **_k: {"gsc": {}, "ga4": {}},
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.store",
        types.SimpleNamespace(write_google_data=lambda *_a, **_k: None),
    )
    args = argparse.Namespace(list_properties=False, test=False, property_id=3)
    with pytest.raises(SystemExit) as exc:
        google_cmd.run({"start_url": "https://ex.com"}, "/tmp", lambda _k, d: d, args)
    assert exc.value.code == 0


def test_google_cmd_integrations_helpers_errors() -> None:
    from website_profiling.commands import google_cmd

    with pytest.raises(RuntimeError, match="property_id is required"):
        google_cmd._list_properties_via_integrations(None)

    with pytest.raises(RuntimeError, match="No property selected"):
        google_cmd._fetch_via_integrations(
            "http://integrations:8093",
            property_id=None,
            date_range_days=28,
            crawl_urls=[],
            start_url="https://ex.com",
            config={},
        )

