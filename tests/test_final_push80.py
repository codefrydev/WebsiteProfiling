from __future__ import annotations

import argparse
import types

import pandas as pd
import pytest


class C:
    def __init__(self, rows=None, row=None):
        self._rows = rows or []
        self._row = row
        self.executed = []
        self.commits = 0

    def execute(self, sql, params=None):
        self.executed.append((sql, params))
        if "SELECT data FROM lighthouse_runs ORDER BY id DESC LIMIT 1" in sql:
            return C(row={"data": {"latest": 1}})
        if "RETURNING id" in sql:
            return C(row={"id": 7})
        if "ORDER BY id DESC LIMIT 1" in sql:
            return C(row={"id": 2})
        if "SELECT url, data FROM crawl_results" in sql:
            return C(rows=[{"url": "u", "data": {"viewport_present": True, "noindex": False, "has_schema": True}}])
        if "SELECT from_url, to_url FROM edges" in sql:
            return C(rows=[{"from_url": "a", "to_url": "b"}])
        if "SELECT url, count FROM nodes" in sql:
            return C(rows=[{"url": "u", "count": 1}])
        if "SELECT data FROM lighthouse_runs WHERE id" in sql:
            return C(row={"data": {"x": 1}})
        if "SELECT data FROM lighthouse_runs ORDER BY id DESC LIMIT 1" in sql:
            return C(row={"data": {"latest": 1}})
        return C()

    def fetchone(self):
        return self._row

    def fetchall(self):
        return list(self._rows)

    def commit(self):
        self.commits += 1

    def transaction(self):
        class CM:
            def __enter__(self_non):
                return None

            def __exit__(self_non, _t, _v, _tb):
                return False

        return CM()

    def cursor(self):
        cur = C()

        class CM:
            def __enter__(self_non):
                return cur

            def __exit__(self_non, _t, _v, _tb):
                return False

        return CM()

    def executemany(self, _sql, _params):
        return None


def test_crawl_store_write_read_paths(monkeypatch):
    from website_profiling.db import crawl_store as cs

    conn = C()
    # write_crawl with explicit run id
    df = pd.DataFrame([{"url": "https://a.com/", "status": 200, "title": "A"}])
    cs.write_crawl(conn, df, crawl_run_id=5)  # type: ignore[arg-type]
    assert any("DELETE FROM crawl_results WHERE crawl_run_id" in s for s, _ in conn.executed)

    # write_crawl when run id missing should create crawl_run
    conn2 = C()
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    cs.write_crawl(conn2, df, crawl_run_id=None)  # type: ignore[arg-type]
    assert any("INSERT INTO crawl_runs" in s for s, _ in conn2.executed)

    # read_crawl bool coercion
    out = cs.read_crawl(C(), run_id=1)  # type: ignore[arg-type]
    assert bool(out.loc[0, "viewport_present"]) is True

    assert cs.read_edges(C(), run_id=1) == [("a", "b")]  # type: ignore[arg-type]
    assert list(cs.read_nodes(C(), run_id=1).columns) == ["url", "count"]  # type: ignore[arg-type]


def test_lighthouse_store_run_json_and_latest_and_page_summary():
    from website_profiling.db import lighthouse_store as ls

    conn = C()
    assert ls.read_lighthouse_run_json(conn, 1) == {"x": 1}  # type: ignore[arg-type]
    assert ls.read_latest_lighthouse_run_json(conn) == {"latest": 1}  # type: ignore[arg-type]
    ls.write_lighthouse_page_summary(conn, "https://a.com", {"s": 1})  # type: ignore[arg-type]
    assert conn.commits >= 1


def test_google_run_runtimeerror_branch(monkeypatch):
    from website_profiling.commands import google_cmd

    class Ctx:
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
        types.SimpleNamespace(fetch_google_data=lambda **_k: (_ for _ in ()).throw(RuntimeError("bad")), list_properties=lambda *_a, **_k: {}),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.store",
        types.SimpleNamespace(write_google_data=lambda *_a, **_k: None),
    )

    import sys as _sys
    import types as _types

    g = _types.ModuleType("google")
    ga = _types.ModuleType("google.auth")
    ge = _types.ModuleType("google.auth.exceptions")
    ge.RefreshError = ValueError
    ga.exceptions = ge
    g.auth = ga
    monkeypatch.setitem(_sys.modules, "google", g)
    monkeypatch.setitem(_sys.modules, "google.auth", ga)
    monkeypatch.setitem(_sys.modules, "google.auth.exceptions", ge)

    import website_profiling.db as db

    monkeypatch.setattr(google_cmd, "resolve_property_id_from_cfg", lambda _cfg: 1)
    monkeypatch.setattr(db, "db_session", lambda: Ctx())
    monkeypatch.setattr(db, "get_latest_crawl_run_id", lambda _c: None)
    monkeypatch.setattr(db, "read_crawl", lambda *_a, **_k: pd.DataFrame())

    with pytest.raises(SystemExit) as e:
        google_cmd.run({"start_url": "https://a.com"}, "/tmp", lambda _k, d: d, argparse.Namespace(list_properties=False, test=False))
    assert e.value.code == 1


def test_google_run_google_test_success_branch(monkeypatch):
    from website_profiling.commands import google_cmd

    import sys as _sys
    import types as _types

    g = _types.ModuleType("google")
    ga = _types.ModuleType("google.auth")
    ge = _types.ModuleType("google.auth.exceptions")
    ge.RefreshError = RuntimeError
    ga.exceptions = ge
    g.auth = ga
    monkeypatch.setitem(_sys.modules, "google", g)
    monkeypatch.setitem(_sys.modules, "google.auth", ga)
    monkeypatch.setitem(_sys.modules, "google.auth.exceptions", ge)

    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.auth",
        _types.SimpleNamespace(
            build_credentials=lambda *_a, **_k: object(),
            resolve_google_targets=lambda *, property_id=None: ("https://prop/", "123", 28),
        ),
    )
    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.gsc",
        _types.SimpleNamespace(
            list_gsc_sites=lambda _c: ["https://prop/"],
            resolve_gsc_site_url=lambda s, _sites: (s, None),
            probe_gsc_site=lambda *_a, **_k: (True, "ok"),
            describe_gsc_site_mismatch=lambda *_a, **_k: "mismatch",
        ),
    )
    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.ga4",
        _types.SimpleNamespace(
            list_ga4_properties=lambda _c: ([{"id": "123", "displayName": "Main"}], None),
            probe_ga4_property=lambda *_a, **_k: (True, "ok"),
        ),
    )

    with pytest.raises(SystemExit) as e:
        google_cmd._run_google_test(1)
    assert e.value.code == 0


def test_crawl_store_more_branches(monkeypatch):
    from website_profiling.db import crawl_store as cs

    row = pd.Series({"url": "https://a.com", "status": 200, "x": 1})
    out = cs._df_row_to_crawl_json(row)
    assert out["status"] == 200
    assert "url" not in out

    monkeypatch.setattr(cs, "get_crawl_run_info", lambda _c, _rid: None)
    assert cs._canonical_domain_from_report(C(), {"top_pages": [{"url": "https://X.com/p"}]}) == "x.com"  # type: ignore[arg-type]

    conn = C()
    cs.write_edges(conn, [("https://a.com/", "https://b.com/")], crawl_run_id=None)  # type: ignore[arg-type]
    assert conn.commits >= 1

    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    assert cs.read_edges(conn, run_id=None) == []  # type: ignore[arg-type]


def test_google_run_google_test_error_branches(monkeypatch):
    from website_profiling.commands import google_cmd
    import sys as _sys
    import types as _types

    g = _types.ModuleType("google")
    ga = _types.ModuleType("google.auth")
    ge = _types.ModuleType("google.auth.exceptions")
    ge.RefreshError = RuntimeError
    ga.exceptions = ge
    g.auth = ga
    monkeypatch.setitem(_sys.modules, "google", g)
    monkeypatch.setitem(_sys.modules, "google.auth", ga)
    monkeypatch.setitem(_sys.modules, "google.auth.exceptions", ge)

    # Branch: resolve mismatch and GA4 probe failure -> exit 1
    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.auth",
        _types.SimpleNamespace(
            build_credentials=lambda *_a, **_k: object(),
            resolve_google_targets=lambda *, property_id=None: ("https://bad/", "999", 28),
        ),
    )
    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.gsc",
        _types.SimpleNamespace(
            list_gsc_sites=lambda _c: ["https://good/"],
            resolve_gsc_site_url=lambda *_a, **_k: (None, "bad site"),
            probe_gsc_site=lambda *_a, **_k: (False, "no"),
            describe_gsc_site_mismatch=lambda *_a, **_k: "mismatch",
        ),
    )
    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.ga4",
        _types.SimpleNamespace(
            list_ga4_properties=lambda _c: ([], "list err"),
            probe_ga4_property=lambda *_a, **_k: (False, "ga4 bad"),
        ),
    )
    with pytest.raises(SystemExit) as e:
        google_cmd._run_google_test(1)
    assert e.value.code == 1

