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

