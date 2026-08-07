"""Edge-case unit tests for commands, config resolution, and db stores."""
from __future__ import annotations

import argparse
import json
import math
import sys
import types
from contextlib import contextmanager
from unittest.mock import MagicMock

import pandas as pd
import pytest

from tests.db_test_fakes import FakeConn, FakeCursor
from tests.db_test_fakes import CrawlConn


# ---------------------------------------------------------------------------
# analysis/local.py
# ---------------------------------------------------------------------------


def test_local_import_rapidfuzz_and_langdetect_errors(monkeypatch) -> None:
    from website_profiling.analysis import local

    real_import = __import__("builtins").__import__

    def mock_import(name, *args, **kwargs):
        if name == "rapidfuzz":
            raise ImportError("no rapidfuzz")
        if name == "langdetect":
            raise ImportError("no langdetect")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", mock_import)
    with pytest.raises(ImportError, match="pip install"):
        local._import_rapidfuzz()
    with pytest.raises(ImportError, match="pip install"):
        local._import_langdetect()


def test_hamming_distance() -> None:
    from website_profiling.analysis.local import _hamming

    assert _hamming(0b1010, 0b1100) == 2


def test_compute_duplicate_groups_full_paths(monkeypatch) -> None:
    from website_profiling.analysis import local

    fuzz = types.SimpleNamespace(token_set_ratio=lambda a, b: 100 if a == b else 50)
    monkeypatch.setattr(local, "_import_rapidfuzz", lambda: fuzz)

    df = pd.DataFrame(
        [
            {
                "url": "https://a.com/1",
                "status": "200",
                "content_type": "text/html",
                "title": "same content here for duplicate",
            },
            {
                "url": "https://a.com/2",
                "status": "200",
                "content_type": "text/html",
                "title": "same content here for duplicate",
            },
        ]
    )
    groups, mapping, _warnings = local.compute_duplicate_groups(
        df, {"enable_duplicate_detection": "true", "analysis_simhash_hamming": "3", "analysis_fuzzy_threshold": "90"}
    )
    assert len(groups) >= 1
    assert mapping

    # short fingerprint skipped
    df_short = pd.DataFrame([{"url": "https://a.com/x", "status": "200", "content_type": "text/html", "title": "hi"}])
    g2, m2, _w2 = local.compute_duplicate_groups(df_short, {"enable_duplicate_detection": "true"})
    assert g2 == []


def test_compute_language_signals_langdetect_exception(monkeypatch) -> None:
    from website_profiling.analysis import local

    class LangDetectException(Exception):
        pass

    def boom(_text):
        raise LangDetectException("unknown")

    monkeypatch.setattr(local, "_import_langdetect", lambda: (boom, LangDetectException))
    df = pd.DataFrame(
        [{"url": "https://a.com", "status": "200", "title": "Enough text here for language detection test case"}]
    )
    by_url, summary = local.compute_language_signals(df, {"enable_language_detection": "true"})
    assert by_url == {}
    assert summary["mixed_site"] is False


def test_run_local_enrichment_empty_df() -> None:
    from website_profiling.analysis.local import run_local_enrichment

    out = run_local_enrichment(pd.DataFrame(), {})
    assert out["content_duplicates"] == []


# ---------------------------------------------------------------------------
# analysis/page.py
# ---------------------------------------------------------------------------


def test_visible_anchor_text_and_input_label_paths() -> None:
    from website_profiling.analysis.page import _input_has_label, _visible_anchor_text
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(
        '<a href="/x"><img src="/i.png" alt=""><span>child</span> tail</a>',
        "lxml",
    )
    a = soup.find("a")
    assert "x" in _visible_anchor_text(a)

    soup2 = BeautifulSoup(
        """
        <form>
          <input type="hidden" name="h">
          <input id="q" aria-label="Search">
          <label for="e">Email</label><input id="e">
          <label>Wrap <input name="w"></label>
          <input name="bare">
        </form>
        """,
        "lxml",
    )
    assert _input_has_label(soup2, soup2.find("input", {"name": "h"})) is True
    assert _input_has_label(soup2, soup2.find("input", {"id": "q"})) is True
    assert _input_has_label(soup2, soup2.find("input", {"id": "e"})) is True
    assert _input_has_label(soup2, soup2.find("input", {"name": "w"})) is True
    assert _input_has_label(soup2, soup2.find("input", {"name": "bare"})) is False


def test_analyze_html_skipped_headings_and_hreflang() -> None:
    from website_profiling.analysis.page import analyze_html

    html = """
    <html lang="en">
      <head>
        <link rel="alternate" hreflang="en-us" href="/en/" />
        <link rel="alternate" hreflang="fr" href="/fr/" />
      </head>
      <body>
        <h1>One</h1>
        <h3>Skipped</h3>
        <a href="/x"><img src="/i.png"></a>
        <script type="application/ld+json">{"name":"X"}</script>
      </body>
    </html>
    """
    out = analyze_html(html, "https://site.com/p", "https://site.com/p")
    assert out["html_lang"] == "en"
    assert len(out["hreflang_alternates"]) >= 1
    assert isinstance(out["warnings"], list)


def test_json_ld_walk_nested_graph() -> None:
    from website_profiling.analysis.page import _json_ld_missing_type

    assert _json_ld_missing_type({"@graph": [{"@type": "Thing"}, {"name": "no type"}]}) is True
    assert _json_ld_missing_type([{"@context": "x"}, {"brand": "Acme"}]) is True


# ---------------------------------------------------------------------------
# common.py, config.py
# ---------------------------------------------------------------------------


def test_load_edges_non_dict_list(tmp_path) -> None:
    from website_profiling.common import load_edges

    p = tmp_path / "edges.json"
    p.write_text(json.dumps(["not", "dicts"]), encoding="utf-8")
    assert load_edges(str(p)) == []


def test_parse_content_text_reading_level_branch() -> None:
    from bs4 import BeautifulSoup
    from website_profiling.common import parse_content_text

    words = " ".join(["word"] * 50)
    html = f"<html><body><p>{words}</p></body></html>"
    soup = BeautifulSoup(html, "lxml")
    out = parse_content_text(soup, html, excerpt_max_chars=100)
    assert out["reading_level"] > 0


def test_detect_tech_wappalyzer_regex_warning_disables(monkeypatch) -> None:
    from website_profiling import common

    common.reset_wappalyzer_state()

    class FakeWappalyzer:
        @staticmethod
        def latest():
            return FakeWappalyzer()

        def analyze(self, _page):
            return {"X"}

    class FakeWebPage:
        def __init__(self, *args, **kwargs):
            pass

    import warnings

    def warn(message, *args, **kwargs):
        w = warnings.WarningMessage("Compiling regex with unbalanced parenthesis", UserWarning, "")
        return [w]

    monkeypatch.setitem(
        sys.modules,
        "Wappalyzer",
        types.SimpleNamespace(Wappalyzer=FakeWappalyzer, WebPage=FakeWebPage),
    )
    monkeypatch.setattr(warnings, "catch_warnings", lambda *a, **k: types.SimpleNamespace(__enter__=lambda s: s, __exit__=lambda *x: None, append=lambda m: None))
    monkeypatch.setattr(
        warnings,
        "simplefilter",
        lambda *a, **k: None,
    )

    # Force regex warning path
    class Caught:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def __iter__(self):
            class W:
                message = "Compiling regex with unbalanced parenthesis"

            return iter([W()])

    monkeypatch.setattr(warnings, "catch_warnings", lambda *a, **k: Caught())

    from bs4 import BeautifulSoup

    soup = BeautifulSoup("<html></html>", "lxml")
    result = common.detect_tech_wappalyzer("https://x.com", "<html></html>", {}, soup)
    assert isinstance(result, str)


def test_parse_links_serialized_ast_fallback() -> None:
    from website_profiling.common import parse_links_serialized

    assert parse_links_serialized("[bad") == ["[bad"]
    assert parse_links_serialized(float("nan")) == []


def test_load_config_from_db_success(monkeypatch) -> None:
    from website_profiling.config import load_config_from_db

    monkeypatch.setenv("DATABASE_URL", "postgres://x")

    class Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, *_):
            return False

    monkeypatch.setattr("website_profiling.db.storage.get_database_url", lambda: "postgres://x")
    monkeypatch.setattr("website_profiling.db.db_session", lambda: Ctx())
    monkeypatch.setattr(
        "website_profiling.db.typed_config.worker_config.load_worker_pipeline_config",
        lambda _c: {"start_url": "https://a.com"},
    )
    assert load_config_from_db()["start_url"] == "https://a.com"


# ---------------------------------------------------------------------------
# spa_heuristics, sitemap, browser_diagnostics
# ---------------------------------------------------------------------------


def test_spa_heuristics_non_200_and_empty() -> None:
    from website_profiling.crawl.fetchers.base import FetchResult
    from website_profiling.crawl.fetchers.spa_heuristics import needs_js_render, needs_js_render_after_parse

    bad = FetchResult(
        status=404,
        content_type="text/html",
        text="<html></html>",
        response_time_ms=1,
        content_length=10,
        final_url="https://x.com",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="static",
    )
    assert needs_js_render(bad) is False
    empty = FetchResult(
        status=200,
        content_type="text/html",
        text="",
        response_time_ms=1,
        content_length=0,
        final_url="https://x.com",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="static",
    )
    assert needs_js_render(empty) is False
    assert needs_js_render_after_parse(empty, link_count=0, same_domain_link_count=0) is False


def test_discover_sitemap_duplicate_and_exception_in_loop(monkeypatch) -> None:
    from website_profiling.crawl.sitemap import discover_sitemap_urls

    class FakeResp:
        def __init__(self, code, text):
            self.status_code = code
            self.text = text

    seen = {"n": 0}

    class FakeSession:
        headers = {}

        def get(self, url, timeout=0):
            if url.endswith("/robots.txt"):
                return FakeResp(200, "Sitemap: https://example.com/sitemap.xml\nSitemap: https://example.com/sitemap.xml\n")
            if url.endswith("/sitemap.xml"):
                seen["n"] += 1
                if seen["n"] > 1:
                    raise ConnectionError("fail")
                return FakeResp(
                    200,
                    """<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                    <url><loc>https://example.com/p</loc></url></urlset>""",
                )
            return FakeResp(404, "")

        def close(self):
            pass

    monkeypatch.setattr("website_profiling.crawl.sitemap.requests.Session", lambda: FakeSession())
    urls = discover_sitemap_urls("https://example.com", max_urls=5)
    assert "https://example.com/p" in urls


def test_browser_diagnostics_aggregate_page_errors_and_empty() -> None:
    from website_profiling.crawl.fetchers.browser_diagnostics import aggregate_browser_diagnostics_df

    pa = json.dumps(
        {
            "browser": {
                "console": [],
                "page_errors": [{"message": "err"}],
                "summary": {"console_error_count": 0, "page_error_count": 1},
            }
        }
    )
    df = pd.DataFrame([{"url": "https://a.com", "page_analysis": pa}])
    agg = aggregate_browser_diagnostics_df(df)
    assert agg["pages_with_page_errors"] == 1

    pa2 = json.dumps({"browser": {"summary": {}}})
    df2 = pd.DataFrame([{"url": "https://a.com", "page_analysis": pa2}])
    assert aggregate_browser_diagnostics_df(df2) == {}


# ---------------------------------------------------------------------------
# google_cmd.py
# ---------------------------------------------------------------------------


def test_google_cmd_crawl_read_warning(monkeypatch, capsys) -> None:
    from website_profiling.commands import google_cmd
    import website_profiling.db as db

    fetch_mod = types.SimpleNamespace(
        fetch_google_data=lambda **_k: {"errors": []},
        list_properties=lambda **_k: {},
    )
    monkeypatch.setitem(sys.modules, "website_profiling.integrations.google.fetch", fetch_mod)
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.store",
        types.SimpleNamespace(write_google_data=lambda *_a, **_k: None),
    )
    monkeypatch.setattr(google_cmd, "resolve_property_id_from_cfg", lambda _c: 1)

    class Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, *_):
            return False

    monkeypatch.setattr(db, "db_session", lambda: Ctx())
    monkeypatch.setattr(
        db,
        "get_latest_crawl_run_id",
        lambda _c: (_ for _ in ()).throw(RuntimeError("no crawl")),
    )

    with pytest.raises(SystemExit) as e:
        google_cmd.run({}, "/tmp", lambda _k, d: d, argparse.Namespace(list_properties=False, test=False, property_id=None))
    assert e.value.code == 0


def test_google_cmd_test_gsc_ga4_branches(monkeypatch, capsys) -> None:
    from website_profiling.commands import google_cmd

    gsc = types.SimpleNamespace(
        list_gsc_sites=lambda _c: ["https://example.com/"],
        resolve_gsc_site_url=lambda configured, sites: ("https://example.com/", None),
        probe_gsc_site=lambda _c, _u: (False, "probe failed"),
        describe_gsc_site_mismatch=lambda *_a: "mismatch",
    )
    ga4 = types.SimpleNamespace(
        list_ga4_properties=lambda _c: ([{"id": "123", "displayName": "P"}], None),
        probe_ga4_property=lambda _c, _id: (False, "ga4 probe failed"),
    )
    monkeypatch.setitem(sys.modules, "website_profiling.integrations.google.gsc", gsc)
    monkeypatch.setitem(sys.modules, "website_profiling.integrations.google.ga4", ga4)
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.auth",
        types.SimpleNamespace(
            build_credentials=lambda **_k: object(),
            resolve_google_targets=lambda **_k: ("https://other.com/", "999", 28),
        ),
    )
    google_mod = types.ModuleType("google")
    auth_mod = types.ModuleType("google.auth")
    exc_mod = types.ModuleType("google.auth.exceptions")
    exc_mod.RefreshError = type("RefreshError", (Exception,), {})
    auth_mod.exceptions = exc_mod
    google_mod.auth = auth_mod
    monkeypatch.setitem(sys.modules, "google", google_mod)
    monkeypatch.setitem(sys.modules, "google.auth", auth_mod)
    monkeypatch.setitem(sys.modules, "google.auth.exceptions", exc_mod)

    with pytest.raises(SystemExit) as e:
        google_cmd._run_google_test(1)
    assert e.value.code == 1  # warnings from site mismatch note


def _install_google_auth(monkeypatch) -> type[Exception]:
    google_mod = types.ModuleType("google")
    auth_mod = types.ModuleType("google.auth")
    exc_mod = types.ModuleType("google.auth.exceptions")
    refresh_err = type("RefreshError", (Exception,), {})
    exc_mod.RefreshError = refresh_err
    auth_mod.exceptions = exc_mod
    google_mod.auth = auth_mod
    monkeypatch.setitem(sys.modules, "google", google_mod)
    monkeypatch.setitem(sys.modules, "google.auth", auth_mod)
    monkeypatch.setitem(sys.modules, "google.auth.exceptions", exc_mod)
    return refresh_err


def test_google_cmd_refresh_and_test_exception(monkeypatch) -> None:
    from website_profiling.commands import google_cmd

    refresh_err = _install_google_auth(monkeypatch)
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.fetch",
        types.SimpleNamespace(
            fetch_google_data=lambda **_k: (_ for _ in ()).throw(refresh_err()),
            list_properties=lambda **_k: {},
        ),
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.store",
        types.SimpleNamespace(write_google_data=lambda *_a, **_k: None),
    )
    monkeypatch.setattr(google_cmd, "resolve_property_id_from_cfg", lambda _c: 1)

    class Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, *_):
            return False

    monkeypatch.setattr("website_profiling.db.db_session", lambda: Ctx())
    with pytest.raises(SystemExit) as e:
        google_cmd.run({}, "/tmp", lambda _k, d: d, argparse.Namespace(list_properties=False, test=False, property_id=None))
    assert e.value.code == 1

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.auth",
        types.SimpleNamespace(
            build_credentials=lambda **_k: (_ for _ in ()).throw(RuntimeError("fail")),
            resolve_google_targets=lambda **_k: ("", "", 28),
        ),
    )
    _install_google_auth(monkeypatch)
    with pytest.raises(SystemExit) as e2:
        google_cmd._run_google_test(1)
    assert e2.value.code == 1


# ---------------------------------------------------------------------------
# pipeline_cmd.py
# ---------------------------------------------------------------------------


def test_pipeline_select_lighthouse_urls_missing_status() -> None:
    from website_profiling.commands.pipeline_cmd import select_lighthouse_urls_from_crawl

    assert select_lighthouse_urls_from_crawl(pd.DataFrame([{"url": "https://a.com"}]), 5) == []


def test_pipeline_lighthouse_on_pages_and_enrich_failure(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    monkeypatch.setattr(
        "website_profiling.db.get_latest_crawl_run_id",
        lambda _c: 1,
    )
    monkeypatch.setattr(
        "website_profiling.db.read_crawl",
        lambda _c, _r: pd.DataFrame([{"url": "https://a.com", "status": "200"}]),
    )

    class Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, *_):
            return False

    monkeypatch.setattr("website_profiling.db.db_session", lambda: Ctx())
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(
            run_lighthouse_on_pages=lambda **_k: {"attempted": 1, "succeeded": 1, "failed": 0},
        ),
    )
    monkeypatch.setattr(pipeline_cmd, "lighthouse_work_dir", lambda: "/tmp/lh")
    monkeypatch.setattr(pipeline_cmd, "cleanup_lighthouse_work_dir", lambda _p: None)

    pipeline_cmd._run_lighthouse_on_pages(
        {"lighthouse_strategy": "tablet", "lighthouse_mode": "navigation"},
        5,
    )

    from website_profiling.commands import report_build

    monkeypatch.setattr(report_build, "should_enrich_keywords_after_report", lambda _c: True)
    monkeypatch.setattr(report_build, "google_db_has_gsc", lambda _c: True)
    monkeypatch.setattr(report_build, "console_print", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "emit_phase_start", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "emit_phase_done", lambda *_a, **_k: None)
    monkeypatch.setattr(report_build, "emit_progress", lambda *_a, **_k: None)
    monkeypatch.delenv("REPORT_SERVICE_URL", raising=False)
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.keyword_enrich",
        types.SimpleNamespace(run_enrichment=lambda _c: (_ for _ in ()).throw(RuntimeError("kw fail"))),
    )
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.reporting.builder",
        types.SimpleNamespace(run_simple_report=lambda **_k: "/tmp/report.html"),
    )
    monkeypatch.setattr(report_build, "require_start_url", lambda _c, for_step="": "https://a.com")
    pipeline_cmd._run_report({}, True)

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.tools.plot",
        types.SimpleNamespace(run_plot=lambda **_k: 0),
    )
    pipeline_cmd._run_plot({"crawl_render_mode": "bogus", "crawl_js_extra_wait_ms": ""}, True)


def test_pipeline_run_prints_steps(monkeypatch, capsys) -> None:
    from website_profiling.commands import pipeline_cmd

    monkeypatch.setattr(pipeline_cmd, "_run_crawl", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_report", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_plot", lambda *_a, **_k: None)
    monkeypatch.setattr(pipeline_cmd, "_run_lighthouse_on_pages", lambda *_a, **_k: None)
    pipeline_cmd.run(
        {"run_crawl": "true", "run_report": "true", "run_plot": "true"},
        argparse.Namespace(command=None),
    )
    assert "Site Audit" in capsys.readouterr().out


# ---------------------------------------------------------------------------
# crawl_store and other db gaps
# ---------------------------------------------------------------------------


def test_crawl_store_remaining_branches(monkeypatch) -> None:
    from website_profiling.db import crawl_store as cs
    from website_profiling.db._common import _json_val

    assert cs.get_crawl_run_info(CrawlConn(fetchone=None), 1) is None  # type: ignore[arg-type]

    class DoubleBoom(CrawlConn):
        def execute(self, sql, params=None):
            raise RuntimeError("always")

    assert cs.get_crawl_run_info(DoubleBoom(), 1) is None  # type: ignore[arg-type]

    row = pd.Series({"url": "u", "n": pd.NA, "flag": True})
    row["flag"] = True
    out = cs._df_row_to_crawl_json(row)
    assert "url" not in out

    monkeypatch.setattr(cs, "get_crawl_run_info", lambda _c, _r: None)
    assert cs._canonical_domain_from_report(
        FakeConn(),  # type: ignore[arg-type]
        {"crawl_run_id": 1, "top_pages": [], "links": [{"url": "https://b.com/x"}]},
    ) == "b.com"

    monkeypatch.setattr(cs, "get_crawl_run_info", lambda _c, _r: {"start_url": "https://c.com"})
    assert cs._canonical_domain_from_report(FakeConn(), {"crawl_run_id": 1}) == "c.com"  # type: ignore[arg-type]

    assert cs._crawl_rows_from_df(pd.DataFrame(), 1) == []
    cs._write_crawl_rows(CrawlConn(), [])  # type: ignore[arg-type]
    cs._write_crawl_rows(CrawlConn(), [(1, "u", "200", "t", _json_val({}))])  # type: ignore[arg-type]

    batch_conn = CrawlConn()
    cs.write_crawl_batch(batch_conn, [], 1)  # type: ignore[arg-type]
    cs.write_crawl_batch(batch_conn, [(1, "u", "200", "t", "static", _json_val({}))], 1, commit=False)  # type: ignore[arg-type]

    del_conn = CrawlConn(boom_execute=True)
    cs.write_crawl(del_conn, pd.DataFrame(), crawl_run_id=None)  # type: ignore[arg-type]

    class AlwaysBoom(CrawlConn):
        def execute(self, sql, params=None):
            raise RuntimeError("x")

    with pytest.raises(RuntimeError, match="x"):
        cs.read_crawl(AlwaysBoom())  # type: ignore[arg-type]

    rconn = CrawlConn(fetchall=[{"url": "u", "fetch_method": "rendered", "data": {}}])
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    df = cs.read_crawl(rconn, run_id=None)  # type: ignore[arg-type]
    assert df.iloc[0]["fetch_method"] == "rendered"

    rconn2 = CrawlConn(fetchall=[{"url": "u", "fetch_method": "static", "data": {}}])
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: 2)
    df2 = cs.read_crawl(rconn2, run_id=2)  # type: ignore[arg-type]
    assert df2.iloc[0]["fetch_method"] == "static"

    rconn3 = CrawlConn(fetchall=[{"url": "u", "data": {}}])
    df3 = cs.read_crawl(rconn3, run_id=2)  # type: ignore[arg-type]
    assert df3.iloc[0]["fetch_method"] == "static"

    nconn = CrawlConn()
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    cs.write_nodes(nconn, pd.DataFrame([{"url": "https://a.com", "count": 1}]), crawl_run_id=None)  # type: ignore[arg-type]

    nread = CrawlConn(fetchall=[])
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: 3)
    assert cs.read_nodes(nread, run_id=None).empty  # type: ignore[arg-type]

    nread2 = CrawlConn(fetchall=[{"url": "u", "count": 2}])
    df_nodes = cs.read_nodes(nread2, run_id=3)  # type: ignore[arg-type]
    assert df_nodes.iloc[0]["count"] == 2


def test_db_common_remaining() -> None:
    from website_profiling.db import _common

    assert _common._parse_row_json({"data": "not-json"}) == "not-json"
    assert _common._row_field(("a", "b"), "missing", index=99) is None
    assert _common._sanitize_for_json(3.14) == 3.14
    assert _common._sanitize_for_json(float("nan")) is None


def test_config_store_write_empty_entries_noop() -> None:
    from website_profiling.db.config_store import write_pipeline_config

    conn = FakeConn()
    write_pipeline_config(conn, {})  # type: ignore[arg-type]
    assert conn.executed == []

    write_pipeline_config(conn, {"start_url": "https://x"})  # type: ignore[arg-type]
    assert conn.executed


def test_historical_read_outer_exception(monkeypatch) -> None:
    from website_profiling.db import historical as h

    monkeypatch.setattr(h, "db_session", lambda: (_ for _ in ()).throw(RuntimeError("no session")))
    assert h.read_historical_data()["report_payload"] == []


def test_historical_restore_row_execute_failure(monkeypatch) -> None:
    from website_profiling.db import historical as h

    class RowFailConn(FakeConn):
        def execute(self, sql, params=None):
            self.executed.append((sql, params))
            raise RuntimeError("row fail")

    monkeypatch.setattr(
        h,
        "_executemany",
        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("bulk fail")),
    )
    h.restore_historical_data(
        RowFailConn(),  # type: ignore[arg-type]
        {"report_payload": [{"id": 1, "generated_at": "x", "site_name": "s", "canonical_domain": "d", "data": {}}]},
    )


def test_lighthouse_store_remaining(monkeypatch) -> None:
    from website_profiling.db import lighthouse_store as ls

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"data": {"audits": {}}}))
    assert ls.read_lighthouse_summary(conn) == {"audits": {}}  # type: ignore[arg-type]

    page_conn = FakeConn()
    page_conn.set_next_cursor(
        FakeCursor(fetchall_value=[{"url": "https://a.com", "data": {"score": 90}}])
    )
    summaries = ls.read_lighthouse_page_summaries(page_conn)  # type: ignore[arg-type]
    assert summaries["https://a.com"]["score"] == 90

    runs_conn = FakeConn()
    runs_conn.set_next_cursor(
        FakeCursor(fetchall_value=[{"id": 5, "url": "https://a.com"}])
    )
    by_url = ls.read_lh_runs_by_url(runs_conn)  # type: ignore[arg-type]
    assert by_url["https://a.com"] == [5]

    assert ls.read_lighthouse_run_json(FakeConn(), 1) is None  # type: ignore[arg-type]
    none_conn = FakeConn()
    none_conn.set_next_cursor(FakeCursor(fetchone_value=None))
    assert ls.read_latest_lighthouse_run_json(none_conn) is None  # type: ignore[arg-type]

    bad_conn = FakeConn()
    bad_conn.set_next_cursor(FakeCursor(fetchone_value={"data": [1, 2, 3]}))
    assert ls.read_lighthouse_run_json(bad_conn, 2) is None  # type: ignore[arg-type]

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.lighthouse.schema",
        types.SimpleNamespace(
            lhr_to_audit_rows=lambda _d: (
                [
                    {
                        "audit_id": "a",
                        "category_id": "c",
                        "score": 1,
                        "score_display_mode": "numeric",
                        "title": "t",
                        "description": "d",
                        "display_value": "v",
                        "numeric_value": 1,
                        "help_text": "h",
                        "details_type": "table",
                        "details_headings": '["h"]',
                        "details_meta": '{"k":1}',
                    }
                ],
                [(0, 0, {"cell": 1})],
            )
        ),
    )
    audit_conn = FakeConn()
    audit_conn.set_next_cursor(FakeCursor(fetchall_value=[{"id": 1}]))
    ls.write_lh_audits_from_run(audit_conn, 1, {"audits": {}})  # type: ignore[arg-type]

    item_conn = FakeConn()
    item_conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {
                    "id": 10,
                    "audit_id": "a",
                    "category_id": "c",
                    "title": "t",
                    "description": "d",
                    "score": 1,
                    "score_display_mode": "numeric",
                    "display_value": "v",
                    "numeric_value": 1,
                    "help_text": "h",
                    "details_type": "table",
                    "details_headings": "[]",
                    "details_meta": "{}",
                }
            ]
        )
    )



def test_llm_cache_read_exception() -> None:
    from website_profiling.db.llm_cache_store import read_llm_cache

    class BoomConn(FakeConn):
        def execute(self, *_a, **_k):
            raise RuntimeError("x")

    assert read_llm_cache(BoomConn(), "k") is None  # type: ignore[arg-type]


def test_report_store_read_latest_and_exception() -> None:
    from website_profiling.db.report_store import read_report_payload

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"data": {"ok": True}}))
    assert read_report_payload(conn)["ok"] is True  # type: ignore[arg-type]

    class BoomConn(FakeConn):
        def execute(self, *_a, **_k):
            raise RuntimeError("x")

    assert read_report_payload(BoomConn()) is None  # type: ignore[arg-type]


def test_google_app_store_sa_dict(monkeypatch) -> None:
    from website_profiling.db import google_app_store as gas

    monkeypatch.setitem(
        sys.modules,
        "google.oauth2.service_account",
        types.SimpleNamespace(
            Credentials=types.SimpleNamespace(
                from_service_account_info=lambda info, scopes=None: {"ok": True, "info": info}
            )
        ),
    )
    out = gas.build_service_account_credentials(
        {
            "service_account_json": {
                "type": "service_account",
                "client_email": "x@y.iam.gserviceaccount.com",
                "private_key": "k",
            }
        }
    )
    assert out["ok"] is True


def test_config_resolve_db_only(monkeypatch, tmp_path, capsys) -> None:
    from website_profiling.commands import config_resolve

    monkeypatch.setattr("website_profiling.db.storage.get_database_url", lambda: "postgres://x")
    config_resolve.require_database_url()

    config_resolve.cleanup_lighthouse_work_dir("")
    config_resolve.cleanup_lighthouse_work_dir("/outside/tmp/not-under-temp")

    assert config_resolve.resolve_property_id_from_cfg(None) is None

    monkeypatch.setattr(config_resolve, "require_database_url", lambda: (_ for _ in ()).throw(RuntimeError("no db")))
    with pytest.raises(SystemExit):
        config_resolve.resolve_config(argparse.Namespace())

    monkeypatch.setattr(config_resolve, "require_database_url", lambda: None)
    monkeypatch.setattr(config_resolve, "load_config_from_db", lambda: {"start_url": "https://db.com"})
    monkeypatch.setattr("website_profiling.db.storage.get_data_dir", lambda: str(tmp_path))
    cfg2, _ = config_resolve.resolve_config(argparse.Namespace())
    assert cfg2["start_url"] == "https://db.com"

    monkeypatch.setattr(config_resolve, "load_config_from_db", lambda: {})
    with pytest.raises(SystemExit):
        config_resolve.resolve_config(argparse.Namespace())


def test_remaining_gaps_misc(monkeypatch) -> None:
    """Cover scattered one-line branches across modules."""
    from bs4 import BeautifulSoup
    from website_profiling.analysis import local
    from website_profiling.analysis.page import _input_has_label, analyze_html
    from website_profiling.commands.pipeline_cmd import select_lighthouse_urls_from_crawl
    from website_profiling.common import parse_links_serialized, parse_seo_extended
    from website_profiling.crawl.fetchers import spa_heuristics
    from website_profiling.crawl.fetchers.base import FetchResult
    from website_profiling.crawl.fetchers.browser_diagnostics import _parse_page_analysis_cell
    from website_profiling.db import crawl_store as cs, config_store, llm_cache_store, report_store
    from website_profiling.db import property_store

    # pipeline select - non-matching status
    assert select_lighthouse_urls_from_crawl(
        pd.DataFrame([{"url": "https://a.com", "status": "404"}]), 5
    ) == []

    # common parse_links_serialized fallback split
    assert parse_links_serialized("https://a.com, https://b.com") == ["https://a.com", "https://b.com"]

    # common parse_seo_extended microdata branch
    html = '<html><body itemscope itemtype="http://schema.org/Product"><span itemprop="name">X</span></body></html>'
    ext = parse_seo_extended(html, "https://s.com")
    assert ext["has_schema"] is True

    # spa empty status / text
    bad = FetchResult(
        status=None,
        content_type="text/html",
        text=None,
        response_time_ms=1,
        content_length=0,
        final_url="https://x.com",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="static",
    )
    assert spa_heuristics.needs_js_render(bad) is False
    from website_profiling.crawl.fetchers.base import FetchResult

    shell = FetchResult(
        status=200,
        content_type="text/html",
        text="x" * 1600,
        response_time_ms=1,
        content_length=1600,
        final_url="https://x.com",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="static",
    )
    assert spa_heuristics.needs_js_render_after_parse(
        shell, link_count=0, same_domain_link_count=0
    ) is True

    # browser diagnostics pandas path
    class FakePd:
        @staticmethod
        def isna(v):
            return v != v

    import website_profiling.crawl.fetchers.browser_diagnostics as bd

    assert _parse_page_analysis_cell(float("nan")) == {}

    # crawl_store branches
    class NoRow(CrawlConn):
        def execute(self, sql, params=None):
            if "FROM crawl_runs WHERE" in sql and "render_mode" not in sql:
                return FakeCursor(fetchone_value=None)
            return super().execute(sql, params)

    assert cs.get_crawl_run_info(NoRow(), 1) is None  # type: ignore[arg-type]

    row = pd.Series({"url": "u", "count": 1})
    row["count"] = 1
    out = cs._df_row_to_crawl_json(row)
    assert "count" in out

    from website_profiling.db._common import _json_val

    batch_conn = CrawlConn()
    cs.write_crawl_batch(
        batch_conn,
        [(1, "u", "200", "t", "static", _json_val({}))],
        1,
        commit=True,
    )

    rconn = CrawlConn(fetchall=[{"url": "u", "fetch_method": None, "data": {}}])
    df = cs.read_crawl(rconn, run_id=1)  # type: ignore[arg-type]
    assert df.iloc[0]["fetch_method"] == "static"

    nconn = CrawlConn()
    cs.write_nodes(nconn, pd.DataFrame([{"url": "https://a.com", "count": 1}]), crawl_run_id=5)  # type: ignore[arg-type]

    empty_nodes = CrawlConn(fetchall=[])
    assert cs.read_nodes(empty_nodes, run_id=5).empty  # type: ignore[arg-type]

    # config_store read_llm_config exception
    class BoomConn(FakeConn):
        def execute(self, *_a, **_k):
            raise RuntimeError("x")

    assert config_store.read_llm_config(BoomConn()) == {}  # type: ignore[arg-type]

    # llm_cache empty batch early return
    assert llm_cache_store.read_llm_cache_batch(FakeConn(), []) == {}  # type: ignore[arg-type]

    # report_store without report_id uses latest
    rconn = FakeConn()
    rconn.set_next_cursor(FakeCursor(fetchone_value={"data": {"latest": True}}))
    assert report_store.read_report_payload(rconn, report_id=None)["latest"] is True  # type: ignore[arg-type]

    # property_store exception in extract
    assert property_store._extract_hostname(object()) == ""  # type: ignore[arg-type]

    # analysis page labelledby and nested walk
    soup = BeautifulSoup(
        '<html><body><input aria-labelledby="lbl"><span id="lbl">Name</span></body></html>',
        "lxml",
    )
    inp = soup.find("input")
    assert _input_has_label(soup, inp) is True

    out = analyze_html(
        '<html><body><table><th>Header</th><td>Cell</td></table></body></html>',
        "https://site.com/t",
        "https://site.com/t",
    )
    assert isinstance(out["warnings"], list)

    # local merge paths
    merged = local.merge_bundles(
        {"url_duplicate_group_id": {"a": "d1"}, "ml_errors": []},
        {"url_duplicate_group_id": {"b": "d2"}, "ner_site_summary": {"org": 1}, "ml_errors": ["e"]},
    )
    assert merged["url_duplicate_group_id"]["b"] == "d2"
    assert merged["ner_site_summary"]["org"] == 1

    payload = {"links": [{"url": "https://a.com", "page_analysis": {"signals": {}}}]}
    bundle = {
        "content_duplicates": [],
        "url_duplicate_group_id": {"https://a.com": "dup_0"},
        "language_by_url": {"https://a.com": "en"},
        "similar_internal_by_url": {"https://a.com": ["https://a.com/b"]},
        "spacy_by_url": {"https://a.com": [{"text": "Acme"}]},
        "keyphrases_by_url": {"https://a.com": ["kw"]},
        "language_summary": {},
        "ner_site_summary": {},
        "ml_errors": [],
    }
    local.merge_analysis_into_payload(payload, bundle)
    assert payload["links"][0]["duplicate_group_id"] == "dup_0"


def test_google_cmd_ga4_note_and_refresh_in_test(monkeypatch) -> None:
    from website_profiling.commands import google_cmd

    _install_google_auth(monkeypatch)
    gsc = types.SimpleNamespace(
        list_gsc_sites=lambda _c: [],
        resolve_gsc_site_url=lambda *_a: (None, "bad"),
        probe_gsc_site=lambda *_a: (False, "x"),
        describe_gsc_site_mismatch=lambda *_a: "mismatch",
    )
    ga4 = types.SimpleNamespace(
        list_ga4_properties=lambda _c: ([{"id": "123", "displayName": "P"}], None),
        probe_ga4_property=lambda _c, _id: (True, "ok"),
    )
    monkeypatch.setitem(sys.modules, "website_profiling.integrations.google.gsc", gsc)
    monkeypatch.setitem(sys.modules, "website_profiling.integrations.google.ga4", ga4)
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.auth",
        types.SimpleNamespace(
            build_credentials=lambda **_k: object(),
            resolve_google_targets=lambda **_k: ("https://x.com/", "999", 28),
        ),
    )
    with pytest.raises(SystemExit) as e:
        google_cmd._run_google_test(1)
    assert e.value.code == 1

    refresh_err = _install_google_auth(monkeypatch)
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.integrations.google.auth",
        types.SimpleNamespace(
            build_credentials=lambda **_k: (_ for _ in ()).throw(refresh_err()),
            resolve_google_targets=lambda **_k: ("", "", 28),
        ),
    )
    with pytest.raises(SystemExit):
        google_cmd._run_google_test(1)


def test_pipeline_cmd_js_extra_wait_none_branch(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    real_get_int = pipeline_cmd.get_int

    def fake_get_int(cfg, key, default=None):
        if key == "crawl_js_extra_wait_ms":
            return None
        return real_get_int(cfg, key, default)

    monkeypatch.setattr(pipeline_cmd, "get_int", fake_get_int)
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.crawl.crawler",
        types.SimpleNamespace(run_crawler=lambda **_k: (None, 1)),
    )
    monkeypatch.setattr(pipeline_cmd, "require_start_url", lambda *_a, **_k: "https://a.com")
    pipeline_cmd._run_crawl(
        {
            "crawl_render_mode": "static",
            "preserve_crawl_history": "true",
        },
        True,
    )

    monkeypatch.setattr(pipeline_cmd, "require_lighthouse_url", lambda _c: "https://a.com")
    monkeypatch.setattr(pipeline_cmd, "lighthouse_work_dir", lambda: "/tmp/lh")
    monkeypatch.setattr(pipeline_cmd, "cleanup_lighthouse_work_dir", lambda _p: None)
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(main=lambda **_k: 3),
    )
    with pytest.raises(RuntimeError, match="Lighthouse failed with exit code 3"):
        pipeline_cmd._run_single_lighthouse({"lighthouse_strategy": "tablet"}, True)

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.lighthouse.runner",
        types.SimpleNamespace(main=lambda **_k: 0),
    )
    pipeline_cmd._run_single_lighthouse({"lighthouse_strategy": "mobile", "lighthouse_categories": "perf"}, True)

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.tools.plot",
        types.SimpleNamespace(run_plot=lambda **_k: 0),
    )
    pipeline_cmd._run_plot({"crawl_render_mode": "static"}, True)


def test_sitemap_max_urls_break(monkeypatch) -> None:
    from website_profiling.crawl.sitemap import discover_sitemap_urls

    class FakeResp:
        def __init__(self, code, text):
            self.status_code = code
            self.text = text

    class FakeSession:
        headers = {}

        def get(self, url, timeout=0):
            if url.endswith("/robots.txt"):
                return FakeResp(200, "")
            if url.endswith("/sitemap.xml"):
                urls = "".join(
                    f"<url><loc>https://example.com/p{i}</loc></url>" for i in range(10)
                )
                return FakeResp(
                    200,
                    f'<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">{urls}</urlset>',
                )
            return FakeResp(404, "")

        def close(self):
            pass

    monkeypatch.setattr("website_profiling.crawl.sitemap.requests.Session", lambda: FakeSession())
    urls = discover_sitemap_urls("https://example.com", max_urls=3)
    assert len(urls) == 3


def test_db_common_row_field_dict_missing_key() -> None:
    from website_profiling.db import _common

    assert _common._row_field({"other": 1}, "data") is None
    assert _common._sanitize_for_json(True) is True
