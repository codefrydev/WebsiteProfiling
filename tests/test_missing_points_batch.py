from __future__ import annotations

import argparse
import types

import pandas as pd
import pytest


def test_cfg_int_uses_legacy_key() -> None:
    from website_profiling.analysis.local import _cfg_int

    cfg = {"ml_fuzzy_threshold": "95"}
    assert _cfg_int(cfg, "analysis_fuzzy_threshold", 92) == 95


def test_compute_duplicate_groups_disabled_returns_empty() -> None:
    from website_profiling.analysis.local import compute_duplicate_groups

    df = pd.DataFrame([{"url": "https://a.com", "status": "200", "content_type": "text/html"}])
    groups, mapping, _warnings = compute_duplicate_groups(df, {"enable_duplicate_detection": "false"})
    assert groups == []
    assert mapping == {}


def test_compute_duplicate_groups_basic_cluster(monkeypatch) -> None:
    from website_profiling.analysis import local

    monkeypatch.setattr(local, "_import_rapidfuzz", lambda: types.SimpleNamespace(token_set_ratio=lambda a, b: 100))
    # Avoid relying on normalize_fingerprint_text internals for this unit
    monkeypatch.setattr(local, "normalize_fingerprint_text", lambda _row: "this is enough textual content for duplicate check")
    df = pd.DataFrame(
        [
            {"url": "https://a.com/1", "status": "200", "content_type": "text/html"},
            {"url": "https://a.com/2", "status": "200", "content_type": "text/html"},
        ]
    )
    groups, mapping, _warnings = local.compute_duplicate_groups(df, {"enable_duplicate_detection": "true"})
    assert len(groups) == 1
    assert mapping["https://a.com/1"].startswith("dup_")


def test_compute_language_signals_disabled() -> None:
    from website_profiling.analysis.local import compute_language_signals

    df = pd.DataFrame([{"url": "https://a.com", "status": "200"}])
    by_url, summary = compute_language_signals(df, {"enable_language_detection": "false"})
    assert by_url == {}
    assert summary["mixed_site"] is False


def test_run_local_enrichment_collects_import_errors(monkeypatch) -> None:
    from website_profiling.analysis import local

    monkeypatch.setattr(local, "compute_duplicate_groups", lambda *_a, **_k: (_ for _ in ()).throw(ImportError("dup import missing")))
    monkeypatch.setattr(local, "compute_language_signals", lambda *_a, **_k: (_ for _ in ()).throw(ImportError("lang import missing")))
    out = local.run_local_enrichment(pd.DataFrame([{"url": "x"}]), {"enable_duplicate_detection": "true"})
    assert len(out["ml_errors"]) == 2


def test_merge_bundles_merges_map_like_fields() -> None:
    from website_profiling.analysis.local import merge_bundles

    local = {"language_by_url": {"a": "en"}, "ml_errors": ["e1"]}
    llm = {"language_by_url": {"b": "fr"}, "ml_errors": ["e2"]}
    out = merge_bundles(local, llm)
    assert out["language_by_url"] == {"a": "en", "b": "fr"}
    assert out["ml_errors"] == ["e1", "e2"]


def test_merge_analysis_into_payload_updates_links() -> None:
    from website_profiling.analysis.local import merge_analysis_into_payload

    payload = {
        "links": [
            {"url": "https://a.com/x", "page_analysis": {"signals": {"language": "old"}}},
        ]
    }
    bundle = {
        "content_duplicates": [{"id": "dup_0"}],
        "url_duplicate_group_id": {"https://a.com/x": "dup_0"},
        "language_by_url": {"https://a.com/x": "en"},
        "spacy_by_url": {"https://a.com/x": [{"text": "Paris"}]},
        "keyphrases_by_url": {"https://a.com/x": ["k1"]},
        "language_summary": {"mixed_site": False},
    }
    merge_analysis_into_payload(payload, bundle)
    rec = payload["links"][0]
    assert rec["duplicate_group_id"] == "dup_0"
    assert rec["detected_language"] == "en"
    assert rec["page_analysis"]["signals"]["language"] == "en"


def test_pool_env_int_and_data_dir(monkeypatch) -> None:
    from website_profiling.db.pool import _env_int, get_data_dir

    monkeypatch.setenv("X_NUM", "0")
    assert _env_int("X_NUM", 7) == 1
    monkeypatch.setenv("X_NUM", "bad")
    assert _env_int("X_NUM", 7) == 7
    monkeypatch.setenv("DATA_DIR", "/tmp/abc")
    assert get_data_dir() == "/tmp/abc"


def test_build_parser_accepts_known_command() -> None:
    from website_profiling.commands.config_resolve import build_parser

    parser = build_parser()
    args = parser.parse_args(["google"])
    assert args.command == "google"


def test_google_cmd_run_fetch_success(monkeypatch) -> None:
    from website_profiling.commands import google_cmd

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.auth",
        types.SimpleNamespace(build_credentials=lambda *_a, **_k: None, read_secrets=lambda *_a, **_k: {}),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.fetch",
        types.SimpleNamespace(fetch_google_data=lambda **_k: {"errors": []}, list_properties=lambda *_a, **_k: {}),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.store",
        types.SimpleNamespace(write_google_data=lambda *_a, **_k: None),
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

    monkeypatch.setattr(google_cmd, "resolve_property_id_from_cfg", lambda _cfg: 1)
    monkeypatch.setattr(db, "db_session", lambda: _Ctx())
    monkeypatch.setattr(db, "get_latest_crawl_run_id", lambda _c: None)
    monkeypatch.setattr(db, "read_crawl", lambda _c, _rid: pd.DataFrame())

    with pytest.raises(SystemExit) as e:
        google_cmd.run({"start_url": "https://a.com"}, cwd="/tmp", path=lambda _k, d: d, args=argparse.Namespace(list_properties=False, test=False))
    assert e.value.code == 0

