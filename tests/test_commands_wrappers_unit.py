import argparse
import types

import pytest


def test_google_cmd_list_properties(monkeypatch, capsys) -> None:
    from website_profiling.commands import google_cmd

    # Fake integrations.google.fetch.list_properties
    fake_fetch = types.SimpleNamespace(
        list_properties=lambda *, property_id=None: {"ok": True},
        fetch_google_data=None,
    )
    fake_auth = types.SimpleNamespace(build_credentials=None, read_secrets=None)
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.fetch",
        fake_fetch,
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.auth",
        fake_auth,
    )

    args = argparse.Namespace(list_properties=True, test=False)
    with pytest.raises(SystemExit) as e:
        google_cmd.run({"google_credentials_path": ""}, cwd="/tmp", path=lambda k, d: d, args=args)
    assert e.value.code == 0
    out = capsys.readouterr().out.strip()
    assert out == '{"ok": true}' or out == '{"ok": True}'


def test_keywords_cmd_expand_only(monkeypatch, capsys) -> None:
    from website_profiling.commands import keywords_cmd

    def fake_expand(seeds, sources):
        return {"seeds": seeds, "sources": list(sources)}

    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.suggest",
        types.SimpleNamespace(batch_expand=fake_expand),
    )
    args = argparse.Namespace(expand_only=True, enrich_google=False)
    with pytest.raises(SystemExit) as e:
        keywords_cmd.run({"keyword_seeds": "a,b"}, args)
    assert e.value.code == 0
    assert '"seeds": ["a", "b"]' in capsys.readouterr().out


def test_warnings_cmd_run(monkeypatch) -> None:
    from website_profiling.commands import warnings_cmd

    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.tools.warnings",
        types.SimpleNamespace(main=lambda **_kw: 0),
    )
    args = argparse.Namespace()
    with pytest.raises(SystemExit) as e:
        warnings_cmd.run({"warning_mapper_input": "", "warning_mapper_input_type": "lighthouse"}, cwd="/tmp", path=lambda k, d: d, args=args)
    assert e.value.code == 0


def test_lighthouse_cmd_run_calls_runner(monkeypatch) -> None:
    from website_profiling.commands import lighthouse_cmd

    called = {"n": 0}

    def fake_main(**_kwargs):
        called["n"] += 1
        return 0

    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(main=fake_main),
    )
    args = argparse.Namespace()
    with pytest.raises(SystemExit) as e:
        lighthouse_cmd.run({"lighthouse_url": "https://x", "start_url": "https://x"}, args)
    assert e.value.code == 0
    assert called["n"] == 1

