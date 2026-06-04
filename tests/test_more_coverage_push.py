from __future__ import annotations

import argparse
import types

import pandas as pd
import pytest


class _Cursor:
    def __init__(self, rows=None, row=None):
        self._rows = rows or []
        self._row = row
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        return self

    def fetchall(self):
        return list(self._rows)

    def fetchone(self):
        return self._row


class _Conn:
    def __init__(self, by_sql=None):
        self.by_sql = by_sql or {}
        self.executed = []
        self.commits = 0

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        for key, cur in self.by_sql.items():
            if key in sql:
                return cur
        return _Cursor()

    def commit(self):
        self.commits += 1

    def cursor(self):
        cur = _Cursor()

        class _CM:
            def __enter__(self_non):
                return cur

            def __exit__(self_non, _t, _v, _tb):
                return False

        return _CM()

    def transaction(self):
        class _CM:
            def __enter__(self_non):
                return None

            def __exit__(self_non, _t, _v, _tb):
                return False

        return _CM()


def test_keywords_expand_only_no_seeds_exits_1(capsys):
    from website_profiling.commands import keywords_cmd

    with pytest.raises(SystemExit) as e:
        keywords_cmd.run({"keyword_seeds": ""}, argparse.Namespace(expand_only=True, enrich_google=False))
    assert e.value.code == 1
    assert "No keyword_seeds configured" in capsys.readouterr().out


def test_keywords_enrich_google_success(monkeypatch):
    from website_profiling.commands import keywords_cmd

    called = {"n": 0}
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.keyword_enrich",
        types.SimpleNamespace(run_enrichment=lambda _cfg: called.__setitem__("n", called["n"] + 1)),
    )
    with pytest.raises(SystemExit) as e:
        keywords_cmd.run({}, argparse.Namespace(expand_only=False, enrich_google=True))
    assert e.value.code == 0
    assert called["n"] == 1


def test_keywords_enrich_google_failure(monkeypatch):
    from website_profiling.commands import keywords_cmd

    def _boom(_cfg):
        raise RuntimeError("x")

    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.keyword_enrich",
        types.SimpleNamespace(run_enrichment=_boom),
    )
    with pytest.raises(SystemExit) as e:
        keywords_cmd.run({}, argparse.Namespace(expand_only=False, enrich_google=True))
    assert e.value.code == 1


def test_keywords_main_flow_nonzero_exit(monkeypatch):
    from website_profiling.commands import keywords_cmd

    monkeypatch.setattr(keywords_cmd, "require_start_url", lambda *_a, **_k: "https://a.com")
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.tools.keywords",
        types.SimpleNamespace(main=lambda **_k: 3),
    )
    with pytest.raises(SystemExit) as e:
        keywords_cmd.run({"enable_google_suggest": "false"}, argparse.Namespace(expand_only=False, enrich_google=False))
    assert e.value.code == 3


def test_keywords_main_flow_enrichment_triggered(monkeypatch):
    from website_profiling.commands import keywords_cmd

    called = {"enrich": 0}
    monkeypatch.setattr(keywords_cmd, "require_start_url", lambda *_a, **_k: "https://a.com")
    monkeypatch.setattr(keywords_cmd, "google_db_has_gsc", lambda _cfg=None: True)
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.tools.keywords",
        types.SimpleNamespace(main=lambda **_k: 0),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.keyword_enrich",
        types.SimpleNamespace(run_enrichment=lambda _cfg: called.__setitem__("enrich", called["enrich"] + 1)),
    )
    with pytest.raises(SystemExit) as e:
        keywords_cmd.run({"enable_google_suggest": "false"}, argparse.Namespace(expand_only=False, enrich_google=False))
    assert e.value.code == 0
    assert called["enrich"] == 1


def test_google_db_has_gsc_true_and_false(monkeypatch):
    from website_profiling.commands import config_resolve

    class _Ctx:
        def __init__(self, conn):
            self.conn = conn

        def __enter__(self):
            return self.conn

        def __exit__(self, _t, _v, _tb):
            return False

    conn_true = _Conn({"SELECT data FROM google_data": _Cursor(row={"data": {"gsc_full": {"top_queries": [1]}}})})
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db", types.SimpleNamespace(db_session=lambda: _Ctx(conn_true)))
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.db.storage",
        types.SimpleNamespace(_parse_row_json=lambda row: row.get("data") if isinstance(row, dict) else row),
    )
    assert config_resolve.google_db_has_gsc() is True

    conn_false = _Conn({"SELECT data FROM google_data": _Cursor(row={"data": {"gsc_full": {}}})})
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db", types.SimpleNamespace(db_session=lambda: _Ctx(conn_false)))
    assert config_resolve.google_db_has_gsc() is False


def test_historical_backup_skip_ci_and_timeout(monkeypatch, tmp_path):
    from website_profiling.db import historical

    monkeypatch.setenv("CI", "true")
    assert historical.backup_db_if_exists(skip_in_ci=True) is None
    monkeypatch.setenv("CI", "false")
    monkeypatch.setattr(historical, "get_data_dir", lambda: str(tmp_path))
    monkeypatch.setattr(historical, "get_database_url", lambda: "postgres://u:p@h/db")
    import subprocess as _sp

    monkeypatch.setattr(
        historical.subprocess,
        "run",
        lambda *a, **k: (_ for _ in ()).throw(_sp.TimeoutExpired(cmd="pg_dump", timeout=1)),
    )
    assert historical.backup_db_if_exists(skip_in_ci=False) is None


def test_ensure_crawl_tables_cleared_commits():
    from website_profiling.db.historical import ensure_crawl_tables_cleared

    conn = _Conn()
    ensure_crawl_tables_cleared(conn)  # type: ignore[arg-type]
    assert conn.commits == 1
    assert any("TRUNCATE crawl_results, edges, nodes" in s for s, _ in conn.executed)


def test_read_lh_runs_by_url_and_page_summaries():
    from website_profiling.db.lighthouse_store import read_lh_runs_by_url, read_lighthouse_page_summaries

    conn = _Conn(
        {
            "SELECT id, url FROM lighthouse_runs": _Cursor(
                rows=[{"id": 1, "url": "https://a.com/"}, {"id": 2, "url": "https://a.com"}]
            ),
            "SELECT url, data FROM lighthouse_page_summaries": _Cursor(
                rows=[{"url": "https://a.com", "data": {"p": 1}}, {"url": "https://b.com", "data": "x"}]
            ),
        }
    )
    by_url = read_lh_runs_by_url(conn)  # type: ignore[arg-type]
    assert by_url["https://a.com"] == [1, 2]
    summaries = read_lighthouse_page_summaries(conn)  # type: ignore[arg-type]
    assert summaries == {"https://a.com": {"p": 1}}


def test_read_lh_audits_with_items_builds_details():
    from website_profiling.db.lighthouse_store import read_lh_audits_with_items

    conn = _Conn(
        {
            "SELECT * FROM lh_audits WHERE run_id": _Cursor(
                rows=[
                    {
                        "id": 7,
                        "audit_id": "a11y",
                        "category_id": "accessibility",
                        "title": "T",
                        "description": "D",
                        "score": 0.8,
                        "score_display_mode": "binary",
                        "display_value": "ok",
                        "numeric_value": 1,
                        "help_text": "",
                        "details_type": "table",
                        "details_headings": [{"k": "v"}],
                        "details_meta": {"m": 1},
                    }
                ]
            ),
            "SELECT row_data FROM lh_audit_items WHERE audit_row_id": _Cursor(rows=[{"row_data": {"x": 1}}]),
        }
    )
    out = read_lh_audits_with_items(conn, 1)  # type: ignore[arg-type]
    assert out[0]["id"] == "a11y"
    assert out[0]["details"]["items"][0]["x"] == 1


def test_crawl_store_core_helpers(monkeypatch):
    from website_profiling.db import crawl_store as cs

    conn = _Conn(
        {
            "RETURNING id": _Cursor(row={"id": 11}),
            "ORDER BY id DESC LIMIT 1": _Cursor(row={"id": 9}),
            "WHERE id = %s": _Cursor(row={"created_at": "now", "start_url": "https://a.com"}),
        }
    )
    assert cs.create_crawl_run(conn, "https://a.com") == 11  # type: ignore[arg-type]
    assert cs.get_latest_crawl_run_id(conn) == 9  # type: ignore[arg-type]
    info = cs.get_crawl_run_info(conn, 9)  # type: ignore[arg-type]
    assert info and info["start_url"] == "https://a.com"
    assert cs._extract_hostname("https://A.com/path") == "a.com"


def test_write_nodes_variants(monkeypatch):
    from website_profiling.db import crawl_store as cs

    conn = _Conn()
    # empty df + run_id none => delete all nodes
    cs.write_nodes(conn, pd.DataFrame(), crawl_run_id=None)  # type: ignore[arg-type]
    assert conn.commits >= 1

    # df without required cols returns early
    before = conn.commits
    cs.write_nodes(conn, pd.DataFrame([{"x": 1}]), crawl_run_id=1)  # type: ignore[arg-type]
    assert conn.commits == before

    # normal insert path with index->url rename
    captured = {"n": 0}
    monkeypatch.setattr(cs, "_executemany", lambda *_a, **_k: captured.__setitem__("n", captured["n"] + 1))
    df = pd.DataFrame([{"index": "https://a.com", "count": 3}])
    cs.write_nodes(conn, df, crawl_run_id=2)  # type: ignore[arg-type]
    assert captured["n"] == 1


def test_historical_read_and_restore(monkeypatch):
    from website_profiling.db import historical as h

    class HistCursor:
        def __init__(self):
            self.rows = [{"id": 1}]

        def execute(self, _sql):
            return None

        def fetchall(self):
            return self.rows

    class HistConn:
        def __init__(self):
            self.commits = 0

        def cursor(self):
            cur = HistCursor()

            class CM:
                def __enter__(self_non):
                    return cur

                def __exit__(self_non, _t, _v, _tb):
                    return False

            return CM()

        def execute(self, _sql, _p=None):
            return None

        def commit(self):
            self.commits += 1

    class Ctx:
        def __enter__(self):
            return HistConn()

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr(h, "db_session", lambda: Ctx())
    data = h.read_historical_data()
    assert "report_payload" in data

    conn = HistConn()
    monkeypatch.setattr(h, "_executemany", lambda *_a, **_k: None)
    h.restore_historical_data(
        conn,  # type: ignore[arg-type]
        {
            "report_payload": [{"id": 1, "generated_at": "x", "site_name": "s", "canonical_domain": "d", "data": {}}],
            "lighthouse_summary": [{"id": 1, "created_at": "x", "data": {}}],
            "lighthouse_runs": [{"id": 1, "created_at": "x", "url": "u", "strategy": "mobile", "run_index": 0, "data": {}}],
            "lighthouse_page_summaries": [{"url": "u", "created_at": "x", "data": {}}],
            "lh_audits": [],
            "lh_audit_items": [],
            "google_data": [],
            "keyword_data": [],
            "keyword_history": [],
            "keyword_suggest_cache": [],
            "crawl_runs": [{"id": 1, "created_at": "x", "start_url": "u"}],
        },
    )
    assert conn.commits == 1


def test_lighthouse_store_write_audits_from_run(monkeypatch):
    from website_profiling.db import lighthouse_store as ls

    conn = _Conn({"SELECT id FROM lh_audits": _Cursor(rows=[{"id": 100}])})
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.lighthouse.schema",
        types.SimpleNamespace(
            lhr_to_audit_rows=lambda _d: (
                [
                    {
                        "audit_id": "a",
                        "category_id": "c",
                        "score": 1,
                        "score_display_mode": "binary",
                        "title": "t",
                        "description": "d",
                        "display_value": "",
                        "numeric_value": 1,
                        "help_text": "",
                        "details_type": "table",
                        "details_headings": "[]",
                        "details_meta": "{}",
                    }
                ],
                [(0, 0, {"x": 1})],
            )
        ),
    )
    calls = {"n": 0}
    monkeypatch.setattr(ls, "_executemany", lambda *_a, **_k: calls.__setitem__("n", calls["n"] + 1))
    ls.write_lh_audits_from_run(conn, 1, {})  # type: ignore[arg-type]
    assert calls["n"] >= 1


def test_google_run_google_test_paths(monkeypatch):
    from website_profiling.commands import google_cmd

    import sys as _sys
    import types as _types

    google_mod = _types.ModuleType("google")
    auth_mod = _types.ModuleType("google.auth")
    exc_mod = _types.ModuleType("google.auth.exceptions")
    exc_mod.RefreshError = RuntimeError
    auth_mod.exceptions = exc_mod
    google_mod.auth = auth_mod
    monkeypatch.setitem(_sys.modules, "google", google_mod)
    monkeypatch.setitem(_sys.modules, "google.auth", auth_mod)
    monkeypatch.setitem(_sys.modules, "google.auth.exceptions", exc_mod)

    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.auth",
        _types.SimpleNamespace(
            build_credentials=lambda *_a, **_k: object(),
            resolve_google_targets=lambda *, property_id=None: ("", "", 28),
        ),
    )
    # no ids configured => warnings => exit 1
    with pytest.raises(SystemExit) as e:
        google_cmd._run_google_test(1)
    assert e.value.code == 1


