"""Edge-case unit tests for analysis, fetchers, crawl_store, and db stores."""
from __future__ import annotations

import json
import sys
import types

import numpy as np
import pandas as pd
import pytest

from tests.db_test_fakes import CrawlConn, FakeConn, FakeCursor


def test_common_mixed_content_srcset_and_links_serialized_fallback() -> None:
    from website_profiling.common import parse_links_serialized, parse_seo_extended

    html = """
    <html><head></head><body>
      <img srcset="http://cdn.example.com/a.jpg 1x, https://cdn.example.com/b.jpg 2x">
    </body></html>
    """
    ext = parse_seo_extended(html, "https://secure.com/page")
    assert ext["mixed_content_count"] >= 1

    # Regression: an all-http:// srcset must count EVERY insecure candidate, not
    # just the first (the generic startswith() previously matched once and skipped
    # the per-candidate loop).
    all_http = '<html><body><img srcset="http://a.com/1.jpg 1x, http://b.com/2.jpg 2x"></body></html>'
    assert parse_seo_extended(all_http, "https://secure.com")["mixed_content_count"] == 2

    assert parse_links_serialized("[unclosed") == ["[unclosed"]


def test_analysis_page_hreflang_preload_and_duplicates() -> None:
    from website_profiling.analysis.page import analyze_html

    html = """
    <html>
      <head>
        <link rel="alternate" href="https://site.com/en/" />
        <link rel="preload" href="/a.woff2" as="font">
        <link rel="preconnect" href="https://cdn.example.com">
      </head>
      <body>
        <a href="/dup">One</a>
        <a href="/dup">Two</a>
        <a href="https://external.com/x">Ext</a>
      </body>
    </html>
    """
    out = analyze_html(html, "https://site.com/page", "https://site.com/page")
    assert out["external_link_count"] >= 1
    assert out["preload_count"] >= 1
    assert out["preconnect_count"] >= 1


def test_analysis_page_json_ld_and_table_warnings() -> None:
    from website_profiling.analysis.page import analyze_html

    html = """
    <html><body>
      <script type="application/ld+json">{"@graph":[{"name":"NoType"}]}</script>
      <table><tr><th>H</th><td>C</td></tr></table>
      <h1>Only H1</h1>
    </body></html>
    """
    out = analyze_html(html, "https://site.com/p", "https://site.com/p")
    assert any(w["id"] == "json_ld_missing_type" for w in out["warnings"])


def test_analysis_local_duplicate_and_language_paths(monkeypatch) -> None:
    from website_profiling.analysis import local

    fuzz = types.SimpleNamespace(
        token_set_ratio=lambda a, b: 95 if "duplicate phrase" in a and "duplicate phrase" in b else 0
    )
    monkeypatch.setattr(local, "_import_rapidfuzz", lambda: fuzz)
    monkeypatch.setattr(
        local,
        "_import_langdetect",
        lambda: (lambda text: "en", type("LDE", (Exception,), {})),
    )

    long_text = "duplicate phrase " * 10
    df = pd.DataFrame(
        [
            {"url": "https://a.com/1", "status": "200", "content_type": "text/html", "title": long_text},
            {"url": "https://a.com/2", "status": "200", "content_type": "text/html", "title": long_text},
            {"url": "", "status": "200", "content_type": "text/html", "title": "short"},
            {"url": "https://a.com/3", "status": "404", "content_type": "text/html", "title": long_text},
        ]
    )
    groups, mapping, _warnings = local.compute_duplicate_groups(
        df,
        {
            "enable_duplicate_detection": "true",
            "analysis_simhash_hamming": "64",
            "analysis_fuzzy_threshold": "90",
        },
    )
    assert groups or mapping

    by_url, summary = local.compute_language_signals(
        df,
        {"enable_language_detection": "true"},
    )
    assert summary["detected_pages"] >= 1

    merged = local.merge_bundles(
        {"language_by_url": {"a": "en"}, "url_duplicate_group_id": {"u": "d1"}},
        {"language_by_url": {"b": "fr"}, "url_duplicate_group_id": {"v": "d2"}},
    )
    assert merged["language_by_url"]["b"] == "fr"
    assert merged["url_duplicate_group_id"]["v"] == "d2"

    payload = {"links": [{"url": "https://a.com/x", "page_analysis": {}}]}
    local.merge_analysis_into_payload(
        payload,
        {
            "content_duplicates": [],
            "url_duplicate_group_id": {},
            "language_by_url": {},
            "language_summary": {},
            "ner_site_summary": {"Person": 2},
            "ml_errors": ["x"],
            "similar_internal_by_url": {},
            "spacy_by_url": {},
            "keyphrases_by_url": {},
        },
    )
    assert payload["ner_site_summary"]["Person"] == 2
    assert payload["ml_errors"] == ["x"]


def test_duplicate_detection_skips_empty_simhash(monkeypatch) -> None:
    """SimHash-0 (untokenizable) pages must not be clustered together as duplicates."""
    from website_profiling.analysis import local

    monkeypatch.setattr(
        local, "_import_rapidfuzz", lambda: types.SimpleNamespace(token_set_ratio=lambda a, b: 0)
    )
    # Force the two "blank" pages to SimHash 0 and the two real pages to share a hash.
    monkeypatch.setattr(local, "simhash_64", lambda fp: 0 if "blank" in fp else 999)
    # Fingerprints must be >= 20 chars to be considered (see compute_duplicate_groups).
    df = pd.DataFrame(
        [
            {"url": "https://a.com/e1", "status": "200", "content_type": "text/html", "title": "blank placeholder page number one"},
            {"url": "https://a.com/e2", "status": "200", "content_type": "text/html", "title": "blank placeholder page number two"},
            {"url": "https://a.com/d1", "status": "200", "content_type": "text/html", "title": "real duplicate content body text here"},
            {"url": "https://a.com/d2", "status": "200", "content_type": "text/html", "title": "real duplicate content body text here"},
        ]
    )
    _groups, mapping, _w = local.compute_duplicate_groups(df, {"enable_duplicate_detection": "true"})
    # The real duplicates are grouped together...
    assert mapping.get("https://a.com/d1") == mapping.get("https://a.com/d2") is not None
    # ...but the two SimHash-0 pages are NOT (they were skipped, not bucketed).
    assert "https://a.com/e1" not in mapping
    assert "https://a.com/e2" not in mapping


def test_browser_diagnostics_pandas_and_aggregate_paths() -> None:
    from website_profiling.crawl.fetchers.browser_diagnostics import (
        _parse_page_analysis_cell,
        aggregate_browser_diagnostics_df,
    )

    assert _parse_page_analysis_cell(pd.NA) == {}

    df = pd.DataFrame(
        [
            {"url": "https://a.com", "page_analysis": "{}"},
            {
                "url": "https://b.com",
                "page_analysis": json.dumps(
                    {
                        "browser": {
                            "console": [{"level": "info", "text": "ok"}],
                            "summary": {"console_error_count": 0, "page_error_count": 0},
                        }
                    }
                ),
            },
        ]
    )
    assert aggregate_browser_diagnostics_df(df) == {}


def test_spa_and_sitemap_last_lines(monkeypatch) -> None:
    from website_profiling.crawl.fetchers.base import FetchResult
    from website_profiling.crawl.fetchers.spa_heuristics import needs_js_render_after_parse
    from website_profiling.crawl.sitemap import discover_sitemap_urls

    rendered = FetchResult(
        status=200,
        content_type="text/html",
        text="<html><div id='root'></div></html>",
        response_time_ms=1,
        content_length=20,
        final_url="https://x.com",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="rendered",
    )
    assert needs_js_render_after_parse(rendered, link_count=0, same_domain_link_count=0) is False

    class FakeResp:
        def __init__(self, code, text):
            self.status_code = code
            self.text = text

    class FakeSession:
        headers = {}
        n = 0

        def get(self, url, timeout=0):
            if url.endswith("/robots.txt"):
                return FakeResp(200, "Sitemap: https://example.com/sitemap.xml\n")
            self.n += 1
            raise OSError("network")

        def close(self):
            pass

    monkeypatch.setattr("website_profiling.crawl.sitemap.requests.Session", lambda: FakeSession())
    assert discover_sitemap_urls("https://example.com") == []


def test_crawl_store_last_branches(monkeypatch) -> None:
    from website_profiling.db import crawl_store as cs
    from website_profiling.db._common import _json_val

    class SecondNone(CrawlConn):
        def execute(self, sql, params=None):
            self.executed.append((sql, params))
            if "render_mode" in sql:
                raise RuntimeError("no col")
            if "FROM crawl_runs WHERE" in sql:
                return FakeCursor(fetchone_value=None)
            return super().execute(sql, params)

    assert cs.get_crawl_run_info(SecondNone(), 1) is None  # type: ignore[arg-type]

    class ItemSeries(pd.Series):
        def __getitem__(self, key):
            val = super().__getitem__(key)
            return val

    row = pd.Series({"url": "u", "n": np.int64(5)})
    out = cs._df_row_to_crawl_json(row)
    assert out["n"] == 5

    monkeypatch.setattr(
        "website_profiling.db.crawl_store.urlparse",
        lambda *_a, **_k: (_ for _ in ()).throw(ValueError()),
    )
    assert cs._extract_hostname("bad") == ""

    batch = CrawlConn()
    cs.write_crawl_batch(batch, [(1, "u", "200", "t", "static", _json_val({}))], 1)  # type: ignore[arg-type]

    rconn = CrawlConn(fetchall=[{"url": "u", "fetch_method": "static", "data": {}}])
    df = cs.read_crawl(rconn, run_id=1)  # type: ignore[arg-type]
    assert df.iloc[0]["fetch_method"] == "static"

    rconn2 = CrawlConn(fetchall=[{"url": "u", "data": {"fetch_method": "rendered"}}])
    df2 = cs.read_crawl(rconn2, run_id=1)  # type: ignore[arg-type]
    assert df2.iloc[0]["fetch_method"] == "rendered"

    nconn = CrawlConn()
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    cs.write_nodes(nconn, pd.DataFrame([{"url": "https://a.com", "count": 1}]), crawl_run_id=None)  # type: ignore[arg-type]

    nr = CrawlConn(fetchall=[])
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    empty = cs.read_nodes(nr, run_id=None)  # type: ignore[arg-type]
    assert list(empty.columns) == ["url", "count"]
    assert empty.empty


def test_db_stores_last_lines(monkeypatch) -> None:
    from website_profiling.db import _common, config_store, llm_cache_store, property_store, report_store

    assert _common._row_field(("only",), "x", index=0) == "only"
    assert _common._sanitize_for_json(None) is None

    conn = FakeConn()
    config_store.write_pipeline_config(conn, {"k": "v"}, unknown_keys=None)  # type: ignore[arg-type]

    wconn = FakeConn()
    config_store.write_llm_config(wconn, {"model": "gpt"}, secret_keys={"api_key"})  # type: ignore[arg-type]
    assert wconn.executed

    lconn = FakeConn()
    lconn.set_next_cursor(FakeCursor(fetchone_value=None))
    assert llm_cache_store.read_llm_cache(lconn, "missing") is None  # type: ignore[arg-type]

    lconn2 = FakeConn()
    lconn2.set_next_cursor(FakeCursor(fetchone_value={"response_json": {"ok": True}}))
    assert json.loads(llm_cache_store.read_llm_cache(lconn2, "k") or "{}")["ok"] is True  # type: ignore[arg-type]

    monkeypatch.setattr(
        "website_profiling.db.property_store.urlparse",
        lambda *_a, **_k: (_ for _ in ()).throw(ValueError()),
    )
    monkeypatch.setattr(
        "website_profiling.db.report_store.urlparse",
        lambda *_a, **_k: (_ for _ in ()).throw(ValueError()),
    )
    assert report_store._extract_hostname("x") == ""
    assert property_store._extract_hostname("x") == ""

    rconn = FakeConn()
    rconn.set_next_cursor(FakeCursor(fetchone_value=None))
    assert report_store.read_report_payload(rconn) is None  # type: ignore[arg-type]


def test_lighthouse_store_audit_paths(monkeypatch) -> None:
    from website_profiling.db import lighthouse_store as ls

    bad_summary = FakeConn()
    bad_summary.set_next_cursor(FakeCursor(fetchone_value={"data": [1]}))
    assert ls.read_lighthouse_summary(bad_summary) is None  # type: ignore[arg-type]

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
                [],
            )
        ),
    )
    audit_conn = FakeConn()
    audit_conn.set_next_cursor(FakeCursor(fetchall_value=[]))
    ls.write_lh_audits_from_run(audit_conn, 1, {"audits": {}})  # type: ignore[arg-type]

    run_conn = FakeConn()
    run_conn.set_next_cursor(FakeCursor(fetchone_value={"data": "not-a-dict"}))
    assert ls.read_latest_lighthouse_run_json(run_conn) is None  # type: ignore[arg-type]

    class AuditConn(FakeConn):
        def execute(self, sql, params=None):
            self.executed.append((sql, params))
            if "lh_audit_items" in sql:
                return FakeCursor(fetchall_value=[{"row_data": "bad"}])
            return FakeCursor(
                fetchall_value=[
                    {
                        "id": 1,
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
                        "details_headings": None,
                        "details_meta": "not-json",
                    }
                ]
            )

    audits = ls.read_lh_audits_with_items(AuditConn(), 1)  # type: ignore[arg-type]
    assert audits[0]["id"] == "a"


def test_pipeline_cmd_js_extra_wait_branches(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    real_get_int = pipeline_cmd.get_int

    def fake_get_int(cfg, key, default=None):
        if key == "crawl_js_extra_wait_ms":
            return None
        return real_get_int(cfg, key, default)

    monkeypatch.setattr(pipeline_cmd, "get_int", fake_get_int)
    monkeypatch.setattr(pipeline_cmd, "require_start_url", lambda *_a, **_k: "https://a.com")
    monkeypatch.setitem(
        sys.modules,
        "website_profiling.crawl.crawler",
        types.SimpleNamespace(run_crawler=lambda **_k: (None, 1)),
    )
    pipeline_cmd._run_crawl({"crawl_render_mode": "static"}, True)

    monkeypatch.setitem(
        sys.modules,
        "website_profiling.tools.plot",
        types.SimpleNamespace(run_plot=lambda **_k: 0),
    )
    pipeline_cmd._run_plot({"crawl_render_mode": "static"}, True)


def test_remaining_in_scope_edge_cases(monkeypatch) -> None:
    from website_profiling.analysis import local
    from website_profiling.analysis.page import _json_ld_missing_type, analyze_html
    from website_profiling.common import parse_links_serialized, parse_seo_extended
    from website_profiling.crawl.fetchers import spa_heuristics
    from website_profiling.crawl.fetchers.base import FetchResult
    from website_profiling.crawl.fetchers.browser_diagnostics import _parse_page_analysis_cell
    from website_profiling.db import _common, config_store, crawl_store as cs
    from website_profiling.db import lighthouse_store as ls

    # common: srcset part-level mixed content + literal_eval except
    srcset_html = '<html><body><img srcset="https://a.com/1.jpg 1x, http://insecure.com/b.jpg 2x"></body></html>'
    assert parse_seo_extended(srcset_html, "https://secure.com")["mixed_content_count"] >= 1
    assert parse_links_serialized("[not valid python]") == ["[not valid python]"]

    # spa: rendered skip + truthy zero-length html
    class TruthyEmpty:
        def __bool__(self) -> bool:
            return True

        def __len__(self) -> int:
            return 0

        def lower(self) -> str:
            return ""

        def count(self, _sub: str) -> int:
            return 0

    rendered = FetchResult(200, "text/html", "<html></html>", 1, 0, "https://x.com", {}, 0, "rendered")
    assert spa_heuristics.needs_js_render(rendered) is False
    empty_body = FetchResult(200, "text/html", TruthyEmpty(), 1, 0, "https://x.com", {}, 0, "static")
    assert spa_heuristics.needs_js_render(empty_body) is False
    assert spa_heuristics.needs_js_render_after_parse(empty_body, link_count=0, same_domain_link_count=0) is False

    # browser diagnostics: None + pandas import failure
    assert _parse_page_analysis_cell(None) == {}
    real_import = __import__("builtins").__import__

    def block_pandas(name, *args, **kwargs):
        if name == "pandas":
            raise ImportError("no pandas")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr("builtins.__import__", block_pandas)
    assert _parse_page_analysis_cell(float("nan")) == {}
    monkeypatch.setattr("builtins.__import__", real_import)

    # _common: non-dict row without index
    assert _common._row_field("plain", "col") is None
    assert _common._row_field(("a",), "missing", index=3) is None

    # config_store read_llm_config success
    ok_conn = FakeConn()
    ok_conn.set_next_cursor(FakeCursor(fetchall_value=[{"key": "model", "value": "gpt"}]))
    assert config_store.read_llm_config(ok_conn)["model"] == "gpt"  # type: ignore[arg-type]

    # crawl_store: delete-only when no run, or resolve latest run id
    nconn = CrawlConn()
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    cs.write_nodes(nconn, pd.DataFrame([{"url": "https://a.com", "count": 1}]), crawl_run_id=None)  # type: ignore[arg-type]
    assert any("DELETE FROM nodes" in sql for sql, _ in nconn.executed)

    rid_conn = CrawlConn()
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: 9)
    cs.write_nodes(rid_conn, pd.DataFrame([{"url": "https://a.com", "count": 1}]), crawl_run_id=None)  # type: ignore[arg-type]
    assert any("DELETE FROM nodes WHERE crawl_run_id" in sql for sql, _ in rid_conn.executed)

    # analysis page: no head, stylesheet without href, duplicate links, nested json-ld
    assert _json_ld_missing_type({"items": [{"name": "entity without type"}]}) is True
    assert _json_ld_missing_type({"@graph": [], "foo": "bar"}) is False
    assert _json_ld_missing_type({"outer": {"inner": {"name": "no type"}}}) is True
    assert _json_ld_missing_type({"@context": {"name": "no type"}}) is True
    page_html = """
    <html><body>
      <a href="https://site.com/dup">1</a><a href="https://site.com/dup">2</a>
      <a href="javascript:void(0)">bad</a>
      <a href="https://other.com/x">ext</a>
      <link rel="stylesheet">
      <script src="javascript:void(0)"></script>
      <script src="/app.js"></script>
      <script type="application/ld+json">   </script>
    </body></html>
    """
    out = analyze_html(page_html, "https://site.com/p", "https://site.com/p")
    assert out["external_link_count"] >= 1
    assert out["internal_link_count"] == 1

    class MockLink:
        def __init__(self, **attrs: str) -> None:
            self._attrs = attrs

        def get(self, key: str, default=None):
            return self._attrs.get(key, default)

    from website_profiling.analysis import page as page_mod

    class MockSoup:
        def find(self, name: str):
            if name == "html":
                return types.SimpleNamespace(get=lambda _k, default="": default)
            if name == "head":
                return None
            return None

        def find_all(self, name=None, **kwargs):
            if name == "link" and kwargs.get("href") is True:
                return [
                    MockLink(rel="alternate", hreflang="en", href="/en"),
                    MockLink(rel="preload", href="/a.woff2"),
                ]
            if name == "link" and kwargs.get("rel"):
                return []
            if name in ("a", "script", "img"):
                return []
            if name in ("h1", "h2", "h3", "h4", "h5", "h6"):
                return []
            return []

    monkeypatch.setattr(page_mod, "BeautifulSoup", lambda *_a, **_k: MockSoup())
    rel_out = analyze_html("<html></html>", "https://site.com/p", "https://site.com/p")
    assert rel_out["preload_count"] == 1
    assert rel_out["hreflang_alternates"]

    # local: successful langdetect import, singleton buckets, path compression, max groups
    detect, _exc = local._import_langdetect()
    assert callable(detect)

    singleton_df = pd.DataFrame(
        [{"url": "https://a.com/only", "status": "200", "content_type": "text/html", "title": "solo page content here"}]
    )
    assert local.compute_duplicate_groups(singleton_df, {"enable_duplicate_detection": "true"})[0] == []

    monkeypatch.setattr(
        local,
        "_import_langdetect",
        lambda: (lambda _t: "en", type("LDE", (Exception,), {})),
    )
    short_df = pd.DataFrame([{"url": "https://a.com", "status": "200", "title": "short"}])
    assert local.compute_language_signals(short_df, {"enable_language_detection": "true"})[0] == {}

    fuzz = types.SimpleNamespace(token_set_ratio=lambda a, b: 100 if a == b else 0)
    monkeypatch.setattr(local, "_import_rapidfuzz", lambda: fuzz)
    dup_df = pd.DataFrame(
        [
            {"url": "https://a.com/1", "status": "200", "content_type": "text/html", "title": "word " * 20},
            {"url": "https://a.com/2", "status": "200", "content_type": "text/html", "title": "word " * 20},
            {"url": "https://a.com/3", "status": "200", "content_type": "text/html", "title": "word " * 20},
        ]
    )
    groups, _mapping, _warnings = local.compute_duplicate_groups(
        dup_df, {"enable_duplicate_detection": "true", "analysis_simhash_hamming": "64"}
    )
    assert groups

    import itertools

    sim_seq = itertools.count()
    monkeypatch.setattr(local, "simhash_64", lambda _fp: next(sim_seq))
    many_rows = []
    for i in range(200):
        title = f"unique duplicate group title number {i} " * 4
        many_rows.append({"url": f"https://a.com/{i}a", "status": "200", "content_type": "text/html", "title": title})
        many_rows.append({"url": f"https://a.com/{i}b", "status": "200", "content_type": "text/html", "title": title})
    many_groups, _mapping, _warnings = local.compute_duplicate_groups(
        pd.DataFrame(many_rows),
        {"enable_duplicate_detection": "true", "analysis_fuzzy_threshold": "90"},
    )
    assert len(many_groups) == 200

    # lighthouse: summary except, headings/meta json strings, audit read except
    class SummaryBoom(FakeConn):
        def execute(self, *_a, **_k):
            raise RuntimeError("x")

    assert ls.read_lighthouse_summary(SummaryBoom()) is None  # type: ignore[arg-type]

    import website_profiling.lighthouse.schema as lh_schema

    monkeypatch.setattr(
        lh_schema,
        "lhr_to_audit_rows",
        lambda _d: (
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
                    "details_headings": ["Col"],
                    "details_meta": {"k": 1},
                }
            ],
            [],
        ),
    )
    audit_write_conn = FakeConn()
    audit_write_conn.set_next_cursor(FakeCursor(fetchall_value=[{"id": 1}]))
    ls.write_lh_audits_from_run(audit_write_conn, 1, {"audits": {}})  # type: ignore[arg-type]

    class RunJsonBoom(FakeConn):
        def execute(self, *_a, **_k):
            raise RuntimeError("db")

    assert ls.read_lighthouse_run_json(RunJsonBoom(), 1) is None  # type: ignore[arg-type]
    assert ls.read_latest_lighthouse_run_json(RunJsonBoom()) is None  # type: ignore[arg-type]

    class FailAudit(FakeConn):
        def execute(self, sql, params=None):
            raise RuntimeError("boom")

    assert ls.read_lh_audits_with_items(FailAudit(), 1) == []  # type: ignore[arg-type]
