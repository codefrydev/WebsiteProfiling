"""Unit tests for common, analysis, commands, and db store modules."""
from __future__ import annotations

import argparse
import json
import math
import types
import warnings
from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pandas as pd
import pytest

from tests.db_test_fakes import CrawlConn, FakeConn, FakeCursor


# ---------------------------------------------------------------------------
# common.py
# ---------------------------------------------------------------------------


def test_load_dataframe_file_not_found() -> None:
    from website_profiling.common import load_dataframe

    with pytest.raises(FileNotFoundError):
        load_dataframe("/no/such/file.csv")


def test_load_save_dataframe_json(tmp_path) -> None:
    from website_profiling.common import load_dataframe, save_dataframe

    df = pd.DataFrame([{"a": 1, "b": "x"}])
    path = tmp_path / "data.json"
    save_dataframe(df, str(path))
    loaded = load_dataframe(str(path))
    assert loaded.shape[0] == 1
    assert "a" in loaded.columns


def test_load_edges_json_and_missing_file(tmp_path) -> None:
    from website_profiling.common import load_edges, save_edges

    assert load_edges(str(tmp_path / "missing.json")) == []

    edges = [("https://a.com", "https://b.com")]
    jp = tmp_path / "edges.json"
    save_edges(edges, str(jp))
    assert load_edges(str(jp)) == edges

    jp.write_text(json.dumps([{"from": "https://x.com", "to": "https://y.com"}]), encoding="utf-8")
    assert load_edges(str(jp)) == [("https://x.com", "https://y.com")]

    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert load_edges(str(bad)) == []


def test_normalize_link_empty_href() -> None:
    from website_profiling.common import normalize_link

    assert normalize_link("https://x.com", "") is None


def test_parse_seo_og_description_fallback() -> None:
    from website_profiling.common import parse_seo

    html = """
    <html><head>
      <meta property="og:description" content="OG desc">
    </head><body><h1>H</h1></body></html>
    """
    meta_desc, *_ = parse_seo("https://s.com", html)
    assert meta_desc == "OG desc"


def test_parse_seo_extended_microdata_and_srcset() -> None:
    from website_profiling.common import parse_seo_extended

    html = """
    <html><body>
      <div itemscope itemtype="https://schema.org/Thing"></div>
      <img srcset="http://insecure.com/a.jpg 1x, https://ok.com/b.jpg 2x">
    </body></html>
    """
    ext = parse_seo_extended(html, "https://secure.com")
    assert ext["has_schema"] is True
    assert ext["mixed_content_count"] >= 1


def test_parse_content_text_reading_level() -> None:
    from bs4 import BeautifulSoup

    from website_profiling.common import parse_content_text

    words = " ".join(f"word{i}" for i in range(50))
    sentences = ". ".join(f"This is sentence number {i} with enough words here" for i in range(8))
    body = f"{words}. {sentences}."
    html = f"<html><body><p>{body}</p></body></html>"
    soup = BeautifulSoup(html, "lxml")
    out = parse_content_text(soup, raw_html=html)
    assert out["word_count"] > 30
    assert out["reading_level"] > 0


def test_is_wappalyzer_regex_warning() -> None:
    from website_profiling.common import _is_wappalyzer_regex_warning

    assert _is_wappalyzer_regex_warning("Error compiling regex: unbalanced parenthesis") is True
    assert _is_wappalyzer_regex_warning("other warning") is False


def test_detect_tech_wappalyzer_paths(monkeypatch) -> None:
    from bs4 import BeautifulSoup

    from website_profiling import common

    common._wappalyzer_instance = None
    common._wappalyzer_disabled = False

    html = "<html><body>test</body></html>"
    soup = BeautifulSoup(html, "lxml")

    # Disabled flag falls back immediately
    common._wappalyzer_disabled = True
    out = common.detect_tech_wappalyzer("https://a.com", html, {}, soup)
    assert out.startswith("[")
    common._wappalyzer_disabled = False

    # ImportError path
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "Wappalyzer":
            raise ImportError("no wappalyzer")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    assert common.detect_tech_wappalyzer("https://a.com", html, {}, soup).startswith("[")

    # Success + regex-warning disable path
    monkeypatch.undo()
    common._wappalyzer_instance = None
    common._wappalyzer_disabled = False

    class FakeWebPage:
        def __init__(self, url, html, headers):
            self.url = url

    class FakeWapp:
        @staticmethod
        def latest():
            return FakeWapp()

        def analyze(self, _page):
            warnings.warn("Error compiling regex: unbalanced parenthesis")
            return {"React", "jQuery"}

    wapp_mod = types.ModuleType("Wappalyzer")
    wapp_mod.Wappalyzer = FakeWapp
    wapp_mod.WebPage = FakeWebPage
    monkeypatch.setitem(__import__("sys").modules, "Wappalyzer", wapp_mod)

    out2 = common.detect_tech_wappalyzer("https://a.com", html, {}, soup)
    assert common._wappalyzer_disabled is True
    assert out2.startswith("[")

    # Exception during analyze
    common._wappalyzer_disabled = False
    common._wappalyzer_instance = None

    class BoomWapp(FakeWapp):
        def analyze(self, _page):
            raise RuntimeError("boom")

    wapp_mod.Wappalyzer = BoomWapp
    assert common.detect_tech_wappalyzer("https://a.com", html, {}, soup, wappalyzer=BoomWapp()).startswith("[")

    # Cached instance path (no warnings)
    common._wappalyzer_disabled = False
    common._wappalyzer_instance = None

    class CleanWapp:
        def analyze(self, _page):
            return {"Vue.js"}

    out3 = common.detect_tech_wappalyzer("https://a.com", html, {}, soup, wappalyzer=CleanWapp())
    assert "Vue.js" in out3


def test_parse_tech_stack_header_match() -> None:
    from bs4 import BeautifulSoup

    from website_profiling.common import parse_tech_stack

    soup = BeautifulSoup("<html></html>", "lxml")
    stack = json.loads(parse_tech_stack(soup, {"X-Custom": "contains cf-ray value"}, "https://a.com"))
    assert "Cloudflare" in stack


def test_parse_links_serialized_branches() -> None:
    from website_profiling.common import _is_empty, parse_links_serialized

    assert _is_empty(float("nan")) is True
    assert parse_links_serialized(["https://a.com/", "https://b.com"]) == ["https://a.com", "https://b.com"]
    assert parse_links_serialized("   ") == []
    assert parse_links_serialized('["a"') == ["[\"a\""]
    assert parse_links_serialized("a.com, b.com") == ["a.com", "b.com"]


def test_load_robots(monkeypatch) -> None:
    from website_profiling.common import load_robots

    class RP:
        def set_url(self, _url):
            pass

        def read(self):
            pass

    monkeypatch.setattr("urllib.robotparser.RobotFileParser", lambda: RP())
    assert load_robots("https://example.com/page") is not None

    class BadRP:
        def set_url(self, _url):
            pass

        def read(self):
            raise OSError("fail")

    monkeypatch.setattr("urllib.robotparser.RobotFileParser", lambda: BadRP())
    assert load_robots("https://example.com") is None


# ---------------------------------------------------------------------------
# analysis/page.py
# ---------------------------------------------------------------------------


def test_analyze_html_comprehensive_warnings() -> None:
    from website_profiling.analysis.page import _input_has_label, _visible_anchor_text, analyze_html
    from bs4 import BeautifulSoup

    big_script = "x" * 9000
    html = f"""
    <html>
      <head>
        <link rel="alternate" hreflang="en" href="/en/" />
        <link rel="alternate" hreflang="x-default" href="/en/" />
        <link rel="alternate" hreflang="x-default" href="/fr/" />
        <link rel="preload" href="/a.woff2" as="font" />
        <link rel="dns-prefetch" href="//cdn.example.com" />
        <script src="/blocking.js"></script>
        <script>{big_script}</script>
        <link rel="stylesheet" href="/style.css" media="all" />
        <script type="application/ld+json">not json</script>
        <script type="application/ld+json">{{"name":"no type"}}</script>
      </head>
      <body>
        <h1>One</h1>
        <h3>Skipped</h3>
        <a href="/dup"></a>
        <a href="/dup">dup</a>
        <a href="/empty-link"></a>
        <a href="/img-link"><img src="/i.png" alt=""></a>
        <input type="text" id="nolabel" />
        <input type="hidden" id="hiddenok" />
        <label for="hiddenok">H</label>
      </body>
    </html>
    """
    out = analyze_html(
        html=html,
        page_url="https://site.com/Path/",
        base_url="https://site.com/Path/",
        canonical_url="",
    )
    ids = {w["id"] for w in out["warnings"]}
    assert "missing_canonical" in ids
    assert "missing_html_lang" in ids
    assert "hreflang_multiple_x_default" in ids
    assert "trailing_slash_path" in ids
    assert "uppercase_path" in ids
    assert "skipped_heading_level" in ids
    assert "large_inline_script" in ids
    assert "render_blocking_script" in ids
    assert "stylesheet_blocking_hint" in ids
    assert "json_ld_missing_type" in ids
    assert "json_ld_parse" in ids
    assert "empty_anchor" in ids
    assert "form_missing_label" in ids
    assert out["preload_count"] >= 1
    assert out["preconnect_count"] >= 1

    soup = BeautifulSoup('<a href="/x"><span>child</span></a>', "lxml")
    a = soup.find("a")
    assert _visible_anchor_text(a) == "child"
    main_soup = BeautifulSoup(html, "lxml")
    assert _input_has_label(main_soup, main_soup.find("input", {"type": "hidden"})) is True


def test_analyze_html_empty_returns_early() -> None:
    from website_profiling.analysis.page import analyze_html

    out = analyze_html(html="", page_url="", base_url="")
    assert out["internal_link_count"] == 0


def test_json_ld_walk_nested_list() -> None:
    from website_profiling.analysis.page import _json_ld_missing_type

    assert _json_ld_missing_type([{"name": "X"}]) is True
    assert _json_ld_missing_type({"outer": {"name": "nested"}}) is True


# ---------------------------------------------------------------------------
# analysis/local.py
# ---------------------------------------------------------------------------


def test_local_cfg_helpers() -> None:
    from website_profiling.analysis.local import _cfg_bool, _cfg_int

    assert _cfg_bool(None, "x", True) is True
    assert _cfg_int(None, "analysis_fuzzy_threshold", 92) == 92
    assert _cfg_int({"analysis_fuzzy_threshold": "bad"}, "analysis_fuzzy_threshold", 92) == 92
    assert _cfg_int({"ml_simhash_hamming": "3"}, "analysis_simhash_hamming", 0) == 3


def test_simhash_and_hamming() -> None:
    from website_profiling.analysis.local import _hamming, simhash_64

    assert simhash_64("") == 0
    h1 = simhash_64("hello world test content here")
    h2 = simhash_64("hello world test content here")
    assert h1 == h2
    assert _hamming(h1, h2) == 0
    assert _hamming(h1, h1 ^ 1) >= 1


def test_compute_duplicate_groups_hamming_and_fuzzy(monkeypatch) -> None:
    from website_profiling.analysis import local

    text = "this is enough textual content for duplicate check and more words"
    monkeypatch.setattr(local, "_import_rapidfuzz", lambda: types.SimpleNamespace(token_set_ratio=lambda a, b: 95))
    monkeypatch.setattr(local, "normalize_fingerprint_text", lambda _row: text)

    df = pd.DataFrame(
        [
            {"url": "https://a.com/1", "status": "200", "content_type": "text/html"},
            {"url": "https://a.com/2", "status": "200", "content_type": "text/html"},
            {"url": "https://a.com/3", "status": "404", "content_type": "text/html"},
        ]
    )
    cfg = {
        "enable_duplicate_detection": "true",
        "analysis_simhash_hamming": "64",
        "analysis_fuzzy_threshold": "90",
        "analysis_dup_max_pages": "10",
    }
    groups, mapping = local.compute_duplicate_groups(df, cfg)
    assert len(groups) >= 1
    assert any(k.startswith("dup_") for k in mapping.values())


def test_compute_language_signals_enabled(monkeypatch) -> None:
    from website_profiling.analysis import local

    monkeypatch.setattr(
        local,
        "_import_langdetect",
        lambda: (lambda _t: "en", type("E", (Exception,), {})),
    )
    monkeypatch.setattr(local, "normalize_fingerprint_text", lambda _row: "x" * 40)
    df = pd.DataFrame([{"url": "https://a.com", "status": "200"}])
    by_url, summary = local.compute_language_signals(df, {"enable_language_detection": "true"})
    assert by_url.get("https://a.com") == "en"
    assert summary["detected_pages"] == 1


def test_run_local_enrichment_success(monkeypatch) -> None:
    from website_profiling.analysis import local

    monkeypatch.setattr(local, "compute_duplicate_groups", lambda *_a, **_k: ([{"id": "dup_0"}], {"https://a.com": "dup_0"}))
    monkeypatch.setattr(
        local,
        "compute_language_signals",
        lambda *_a, **_k: ({"https://a.com": "en"}, {"counts": {"en": 1}, "mixed_site": False}),
    )
    out = local.run_local_enrichment(pd.DataFrame([{"url": "https://a.com"}]), {"enable_duplicate_detection": "true"})
    assert out["content_duplicates"]
    assert out["language_by_url"]["https://a.com"] == "en"


def test_merge_bundles_and_payload_edges() -> None:
    from website_profiling.analysis.local import merge_analysis_into_payload, merge_bundles

    merged = merge_bundles(
        {"url_duplicate_group_id": {"a": "d0"}},
        {"content_duplicates": [{"id": "d0"}], "ner_site_summary": {"ORG": 1}, "ml_errors": ["e2"]},
    )
    assert merged["content_duplicates"]
    assert merged["ner_site_summary"]["ORG"] == 1

    payload = {"links": ["not-a-dict", {"url": "https://z.com", "page_analysis": {}}]}
    bundle = {
        "ner_site_summary": {},
        "ml_errors": [],
        "language_by_url": {"https://z.com": "fr"},
        "spacy_by_url": {"https://z.com": []},
    }
    merge_analysis_into_payload(payload, bundle)
    assert payload["links"][1]["detected_language"] == "fr"


# ---------------------------------------------------------------------------
# config_resolve.py
# ---------------------------------------------------------------------------


def test_shadow_config_path_and_require_database_url(monkeypatch, tmp_path) -> None:
    from website_profiling.commands import config_resolve

    monkeypatch.setattr("website_profiling.db.storage.get_data_dir", lambda: str(tmp_path))
    assert config_resolve.shadow_config_path().endswith("pipeline-config.txt")

    monkeypatch.setattr("website_profiling.db.storage.get_database_url", lambda: "postgres://localhost/db")
    config_resolve.require_database_url()


def test_cleanup_lighthouse_work_dir_branches() -> None:
    from website_profiling.commands.config_resolve import cleanup_lighthouse_work_dir

    cleanup_lighthouse_work_dir("")
    cleanup_lighthouse_work_dir("/etc/passwd")


def test_resolve_property_id_no_cfg() -> None:
    from website_profiling.commands.config_resolve import resolve_property_id_from_cfg

    assert resolve_property_id_from_cfg(None) is None


def test_google_db_has_gsc_non_dict_data(monkeypatch) -> None:
    from website_profiling.commands import config_resolve

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"data": "not-a-dict"}))

    class Ctx:
        def __enter__(self):
            return conn

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr("website_profiling.db.db_session", lambda: Ctx())
    assert config_resolve.google_db_has_gsc({}) is False


def test_should_enrich_keywords_fallback_to_gsc_flag() -> None:
    from website_profiling.commands.config_resolve import should_enrich_keywords_after_report

    assert should_enrich_keywords_after_report({"enable_google_search_console": "true"}) is True


def test_resolve_config_db_and_shadow_paths(monkeypatch, tmp_path) -> None:
    from website_profiling.commands import config_resolve

    # Missing config file
    args = argparse.Namespace(config=str(tmp_path / "missing.txt"))
    with pytest.raises(SystemExit) as e:
        config_resolve.resolve_config(args)
    assert e.value.code == 1

    # DB path with shadow fallback
    shadow = tmp_path / "pipeline-config.txt"
    shadow.write_text("start_url = https://shadow.com\n", encoding="utf-8")
    monkeypatch.setattr(config_resolve, "require_database_url", lambda: None)
    monkeypatch.setattr(config_resolve, "load_config_from_db", lambda: {})
    monkeypatch.setattr(config_resolve, "shadow_config_path", lambda: str(shadow))
    monkeypatch.setattr("website_profiling.db.storage.get_data_dir", lambda: str(tmp_path))

    cfg, cwd = config_resolve.resolve_config(argparse.Namespace(config=None))
    assert cfg["start_url"] == "https://shadow.com"

    # DB path with config loaded
    monkeypatch.setattr(config_resolve, "load_config_from_db", lambda: {"start_url": "https://db.com"})
    cfg2, _ = config_resolve.resolve_config(argparse.Namespace(config=None))
    assert cfg2["start_url"] == "https://db.com"

    # No config anywhere
    monkeypatch.setattr(config_resolve, "load_config_from_db", lambda: {})
    monkeypatch.setattr(config_resolve, "shadow_config_path", lambda: str(tmp_path / "nope.txt"))
    with pytest.raises(SystemExit) as e2:
        config_resolve.resolve_config(argparse.Namespace(config=None))
    assert e2.value.code == 1

    # DB URL missing
    def _boom():
        raise RuntimeError("no DATABASE_URL")

    monkeypatch.setattr(config_resolve, "require_database_url", _boom)
    with pytest.raises(SystemExit) as e3:
        config_resolve.resolve_config(argparse.Namespace(config=None))
    assert e3.value.code == 1


# ---------------------------------------------------------------------------
# commands
# ---------------------------------------------------------------------------


def test_google_cmd_branches(monkeypatch) -> None:
    from website_profiling.commands import google_cmd

    # list_properties success
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.fetch",
        types.SimpleNamespace(list_properties=lambda **_k: {"sites": []}, fetch_google_data=lambda **_k: {}),
    )
    with pytest.raises(SystemExit) as e:
        google_cmd.run({}, "/tmp", lambda _k, d: d, argparse.Namespace(list_properties=True, test=False, property_id=None))
    assert e.value.code == 0

    # list_properties error
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.fetch",
        types.SimpleNamespace(list_properties=lambda **_k: (_ for _ in ()).throw(RuntimeError("x")), fetch_google_data=lambda **_k: {}),
    )
    with pytest.raises(SystemExit) as e2:
        google_cmd.run({}, "/tmp", lambda _k, d: d, argparse.Namespace(list_properties=True, test=False, property_id=None))
    assert e2.value.code == 1

    # property_id from args
    assert google_cmd._resolved_property_id({}, argparse.Namespace(property_id=5)) == 5


def test_google_cmd_fetch_with_crawl_and_errors(monkeypatch) -> None:
    from website_profiling.commands import google_cmd
    import sys as _sys

    g = types.ModuleType("google")
    ga = types.ModuleType("google.auth")
    ge = types.ModuleType("google.auth.exceptions")
    ge.RefreshError = RuntimeError
    ga.exceptions = ge
    g.auth = ga
    monkeypatch.setitem(_sys.modules, "google", g)
    monkeypatch.setitem(_sys.modules, "google.auth", ga)
    monkeypatch.setitem(_sys.modules, "google.auth.exceptions", ge)

    class Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    captured: dict = {}

    def fake_fetch(**kwargs):
        captured.update(kwargs)
        return {"errors": ["partial"]}

    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.fetch",
        types.SimpleNamespace(fetch_google_data=fake_fetch, list_properties=lambda *_a, **_k: {}),
    )
    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.store",
        types.SimpleNamespace(write_google_data=lambda *_a, **_k: None),
    )
    import website_profiling.db as db

    monkeypatch.setattr(db, "db_session", lambda: Ctx())
    monkeypatch.setattr(db, "get_latest_crawl_run_id", lambda _c: 1)
    monkeypatch.setattr(db, "read_crawl", lambda _c, _rid: pd.DataFrame([{"url": "https://a.com"}]))
    monkeypatch.setattr(google_cmd, "resolve_property_id_from_cfg", lambda _cfg: None)

    with pytest.raises(SystemExit) as e:
        google_cmd.run(
            {"start_url": "https://a.com"},
            "/tmp",
            lambda _k, d: d,
            argparse.Namespace(list_properties=False, test=False, property_id=9),
        )
    assert e.value.code == 0
    assert captured.get("property_id") == 9
    assert captured.get("crawl_urls") == ["https://a.com"]

    # RefreshError
    monkeypatch.setitem(
        _sys.modules,
        "website_profiling.integrations.google.fetch",
        types.SimpleNamespace(
            fetch_google_data=lambda **_k: (_ for _ in ()).throw(ge.RefreshError("expired")),
            list_properties=lambda *_a, **_k: {},
        ),
    )
    with pytest.raises(SystemExit) as e2:
        google_cmd.run(
            {"start_url": "https://a.com"},
            "/tmp",
            lambda _k, d: d,
            argparse.Namespace(list_properties=False, test=False, property_id=None),
        )
    assert e2.value.code == 1


def test_pipeline_cmd_remaining_branches(monkeypatch) -> None:
    from website_profiling.commands import pipeline_cmd

    assert pipeline_cmd._normalize_render_mode({"crawl_render_mode": "bogus"}) == "static"
    assert pipeline_cmd.select_lighthouse_urls_from_crawl(pd.DataFrame(), 5) == []
    assert pipeline_cmd.select_lighthouse_urls_from_crawl(pd.DataFrame([{"url": "x"}]), 5) == []

    # js_extra_wait_ms None branch in _run_crawl
    monkeypatch.setattr(pipeline_cmd, "require_start_url", lambda *_a, **_k: "https://a.com")
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.crawl.crawler",
        types.SimpleNamespace(run_crawler=lambda **_k: None),
    )
    pipeline_cmd._run_crawl({"crawl_js_extra_wait_ms": "", "crawl_render_mode": "auto"}, True)

    # lighthouse on pages skip
    class Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr("website_profiling.db.db_session", lambda: Ctx())
    monkeypatch.setattr("website_profiling.db.get_latest_crawl_run_id", lambda _c: 1)
    monkeypatch.setattr("website_profiling.db.read_crawl", lambda _c, _rid: pd.DataFrame())
    monkeypatch.setattr(pipeline_cmd, "lighthouse_work_dir", lambda: "/tmp/lh")
    monkeypatch.setattr(pipeline_cmd, "cleanup_lighthouse_work_dir", lambda _p: None)
    pipeline_cmd._run_lighthouse_on_pages({"lighthouse_strategy": "bogus"}, 5)

    # report keyword enrich path
    monkeypatch.setattr(pipeline_cmd, "require_start_url", lambda *_a, **_k: "https://a.com")
    monkeypatch.setattr(pipeline_cmd, "should_enrich_keywords_after_report", lambda _cfg: True)
    monkeypatch.setattr(pipeline_cmd, "google_db_has_gsc", lambda _cfg=None: True)
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.reporting.builder",
        types.SimpleNamespace(run_simple_report=lambda **_k: "out.json"),
    )
    monkeypatch.setitem(
        __import__("sys").modules,
        "website_profiling.integrations.google.keyword_enrich",
        types.SimpleNamespace(run_enrichment=lambda _cfg: None),
    )
    pipeline_cmd._run_report({}, True)

    # plot invalid render mode warning
    captured: dict = {}

    def fake_plot(**kwargs):
        captured.update(kwargs)

    monkeypatch.setitem(__import__("sys").modules, "website_profiling.tools.plot", types.SimpleNamespace(run_plot=fake_plot))
    pipeline_cmd._run_plot({"crawl_render_mode": "invalid-mode"}, True)
    assert captured.get("render_mode") is None


def test_keywords_cmd_enrich_warning(monkeypatch) -> None:
    from website_profiling.commands import keywords_cmd

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
        types.SimpleNamespace(run_enrichment=lambda _cfg: (_ for _ in ()).throw(RuntimeError("kw fail"))),
    )
    with pytest.raises(SystemExit) as e:
        keywords_cmd.run({"enable_google_suggest": "false"}, argparse.Namespace(expand_only=False, enrich_google=False))
    assert e.value.code == 0


def test_lighthouse_cmd_invalid_strategy(monkeypatch) -> None:
    from website_profiling.commands import lighthouse_cmd

    monkeypatch.setattr(lighthouse_cmd, "require_lighthouse_url", lambda _cfg: "https://a.com")
    monkeypatch.setattr(lighthouse_cmd, "lighthouse_work_dir", lambda: "/tmp/lh")
    monkeypatch.setattr(lighthouse_cmd, "cleanup_lighthouse_work_dir", lambda _p: None)
    captured: dict = {}

    def fake_main(**kwargs):
        captured.update(kwargs)
        return 0

    monkeypatch.setitem(__import__("sys").modules, "website_profiling.lighthouse.runner", types.SimpleNamespace(main=fake_main))
    with pytest.raises(SystemExit):
        lighthouse_cmd.run({"lighthouse_url": "https://a.com", "lighthouse_strategy": "tablet"}, argparse.Namespace())
    assert captured.get("strategy") == "mobile"


def test_warnings_cmd_relative_input(monkeypatch, tmp_path) -> None:
    from website_profiling.commands import warnings_cmd

    captured: dict = {}

    def fake_main(**kwargs):
        captured.update(kwargs)
        return 0

    monkeypatch.setitem(__import__("sys").modules, "website_profiling.tools.warnings", types.SimpleNamespace(main=fake_main))
    rel = "input.json"
    (tmp_path / rel).write_text("{}", encoding="utf-8")
    with pytest.raises(SystemExit):
        warnings_cmd.run(
            {"warning_mapper_input": rel, "warning_mapper_input_type": "lighthouse"},
            str(tmp_path),
            lambda _k, d: d,
            argparse.Namespace(),
        )
    assert str(captured.get("input_path", "")).endswith("input.json")


# ---------------------------------------------------------------------------
# db/_common.py and stores
# ---------------------------------------------------------------------------


def test_db_common_json_val_executemany_and_sanitize() -> None:
    from website_profiling.db import _common

    assert _common._json_val({"a": 1}) is not None
    assert _common._parse_json_field(42) == 42
    assert _common._row_field(("only",), "data", index=5) is None

    class BadItem:
        def item(self):
            raise ValueError("nope")

    assert _common._sanitize_for_json(BadItem()) is None

    class Dt:
        def isoformat(self):
            return "2020-01-01"

    assert _common._sanitize_for_json(Dt()) == "2020-01-01"
    assert _common._sanitize_for_json(object()) is not None

    class CursorConn(FakeConn):
        def __init__(self) -> None:
            super().__init__()
            self.cursors: list[FakeCursor] = []

        @contextmanager
        def cursor(self):
            cur = FakeCursor()
            self.cursors.append(cur)
            yield cur

    conn = CursorConn()
    _common._executemany(conn, "INSERT INTO t VALUES (%s)", [], page_size=10)
    _common._executemany(conn, "INSERT INTO t VALUES (%s)", [(1,), (2,)], page_size=1)
    assert sum(len(c.executemany_calls) for c in conn.cursors) >= 2


def test_config_store_read_write_pipeline(monkeypatch) -> None:
    from website_profiling.db.config_store import read_pipeline_config, write_pipeline_config

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {"key": "start_url", "value": "https://a.com", "is_unknown": False},
                {"key": "legacy", "value": "v", "is_unknown": True},
            ]
        )
    )
    known, unknown = read_pipeline_config(conn)  # type: ignore[arg-type]
    assert known["start_url"] == "https://a.com"
    assert unknown[0]["key"] == "legacy"

    wconn = FakeConn()
    write_pipeline_config(wconn, {"k": "v"}, unknown_keys=[{"key": "u", "value": "1"}])  # type: ignore[arg-type]
    assert any("INSERT INTO pipeline_config" in sql for sql, _ in wconn.executed)


def test_crawl_store_branches(monkeypatch) -> None:
    from website_profiling.db import crawl_store as cs

    # create_crawl_run fallback without render_mode
    conn = CrawlConn(fetchone={"id": 3}, boom_execute=True)
    conn.boom_execute = False

    class BoomFirst(CrawlConn):
        def execute(self, sql, params=None):
            self.executed.append((sql, params))
            if "render_mode" in sql:
                raise RuntimeError("no column")
            return super().execute(sql, params)

    conn2 = BoomFirst(fetchone={"id": 4})
    assert cs.create_crawl_run(conn2, start_url="https://a.com", render_mode="js") == 4  # type: ignore[arg-type]

    assert cs.get_latest_crawl_run_id(CrawlConn(boom_execute=True)) is None  # type: ignore[arg-type]

    info_conn = CrawlConn(fetchone={"created_at": "t", "start_url": "u", "render_mode": "static"})
    assert cs.get_crawl_run_info(info_conn, 1)["render_mode"] == "static"  # type: ignore[arg-type]

    # fallback query without render_mode
    class RenderBoom(CrawlConn):
        def execute(self, sql, params=None):
            self.executed.append((sql, params))
            if "render_mode" in sql:
                raise RuntimeError("no render_mode")
            if "FROM crawl_runs WHERE" in sql:
                return FakeCursor(fetchone_value={"created_at": "t", "start_url": "u"})
            return super().execute(sql, params)

    assert cs.get_crawl_run_info(RenderBoom(), 1)["start_url"] == "u"  # type: ignore[arg-type]

    row = pd.Series({"url": "https://a.com", "status": float("nan"), "n": 1})
    out = cs._df_row_to_crawl_json(row)
    assert out["status"] is None

    assert cs._extract_hostname("not-a-url") == ""

    # write_crawl empty with no run id
    empty_conn = CrawlConn()
    cs.write_crawl(empty_conn, pd.DataFrame(), crawl_run_id=None)  # type: ignore[arg-type]

    # write_crawl creates run when missing
    wconn = CrawlConn(fetchone={"id": 9})
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    df = pd.DataFrame([{"url": "https://a.com/", "status": 200}])
    cs.write_crawl(wconn, df, crawl_run_id=None)  # type: ignore[arg-type]

    # legacy insert fallback
    def boom_executemany(conn, sql, params, **kwargs):
        if "fetch_method" in sql:
            raise RuntimeError("legacy")
        from website_profiling.db._common import _executemany as real

        return real(conn, sql, params, page_size=kwargs.get("page_size", 500))

    monkeypatch.setattr(cs, "_executemany", boom_executemany)
    from website_profiling.db._common import _json_val

    cs._write_crawl_rows(wconn, [(1, "u", "200", "t", "static", _json_val({}))])  # type: ignore[arg-type]

    # read_crawl fallback without fetch_method
    rconn = CrawlConn(fetchall=[{"url": "u", "data": {"viewport_present": "true"}}])

    class FailFirst(CrawlConn):
        def execute(self, sql, params=None):
            if "fetch_method" in sql:
                raise RuntimeError("no fm")
            return super().execute(sql, params)

    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: 1)
    df_read = cs.read_crawl(FailFirst(fetchall=[{"url": "u", "data": {}}]), run_id=1)  # type: ignore[arg-type]
    assert "fetch_method" in df_read.columns

    # write_edges no run id, no latest
    econn = CrawlConn()
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    cs.write_edges(econn, [("a", "b")], crawl_run_id=None)  # type: ignore[arg-type]

    # write_nodes empty / missing columns / no run
    cs.write_nodes(CrawlConn(), pd.DataFrame(), crawl_run_id=None)  # type: ignore[arg-type]
    cs.write_nodes(CrawlConn(), pd.DataFrame([{"x": 1}]), crawl_run_id=None)  # type: ignore[arg-type]
    nconn = CrawlConn()
    cs.write_nodes(nconn, pd.DataFrame([{"index": "https://a.com", "count": 2}]), crawl_run_id=None)  # type: ignore[arg-type]

    assert cs.read_edges(CrawlConn(boom_execute=True), run_id=1) == []  # type: ignore[arg-type]
    assert cs.read_nodes(CrawlConn(boom_execute=True), run_id=1).empty  # type: ignore[arg-type]


def test_historical_backup_success_and_restore_fallback(monkeypatch, tmp_path) -> None:
    from website_profiling.db import historical as h

    monkeypatch.setattr(h, "get_data_dir", lambda: str(tmp_path))
    monkeypatch.setattr(h, "get_database_url", lambda: "postgres://u:p@h/db")

    dump_path = tmp_path / "backups" / "out.dump"

    def fake_run(cmd, **kwargs):
        dump_path.parent.mkdir(parents=True, exist_ok=True)
        dump_path.write_bytes(b"dump")
        return types.SimpleNamespace(returncode=0)

    monkeypatch.setattr(h.subprocess, "run", fake_run)
    result = h.backup_db_if_exists(skip_in_ci=False)
    assert result is not None

    # read_historical_data table exception
    class BadConn:
        def cursor(self):
            raise RuntimeError("cursor fail")

    class Ctx:
        def __enter__(self):
            return BadConn()

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr(h, "db_session", lambda: Ctx())
    data = h.read_historical_data()
    assert data["report_payload"] == []

    # restore _bulk row-by-row fallback
    conn = FakeConn()

    def boom_bulk(_conn, _sql, _params, **kwargs):
        raise RuntimeError("bulk fail")

    monkeypatch.setattr(h, "_executemany", boom_bulk)
    h.restore_historical_data(
        conn,  # type: ignore[arg-type]
        {
            "report_payload": [{"id": 1, "generated_at": "x", "site_name": "s", "canonical_domain": "d", "data": {}}],
            "gsc_links_data": [{"id": 1, "fetched_at": "x", "property_id": 1, "data": {}}],
        },
    )
    assert conn.commits == 1


def test_lighthouse_store_branches(monkeypatch) -> None:
    from website_profiling.db import lighthouse_store as ls

    class BoomConn(FakeConn):
        def execute(self, sql, params=None):
            raise RuntimeError("boom")

    assert ls.read_lighthouse_summary(FakeConn()) is None  # type: ignore[arg-type]
    assert ls.read_lh_runs_by_url(BoomConn()) == {}  # type: ignore[arg-type]

    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"data": {"score": 1}}))
    assert ls.read_lighthouse_run_json(conn, 1) == {"score": 1}  # type: ignore[arg-type]

    conn2 = FakeConn()
    conn2.set_next_cursor(FakeCursor(fetchone_value={"data": [1, 2]}))
    assert ls.read_latest_lighthouse_run_json(conn2) is None  # type: ignore[arg-type]

    # write_lh_audits_from_run empty
    ls.write_lh_audits_from_run(FakeConn(), 1, {})  # type: ignore[arg-type]

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
                        "score_display_mode": "numeric",
                        "title": "t",
                        "description": "d",
                        "display_value": "v",
                        "numeric_value": 1,
                        "help_text": "h",
                        "details_type": "table",
                        "details_headings": "[]",
                        "details_meta": "{}",
                    }
                ],
                [],
            )
        ),
    )
    audit_conn = FakeConn()
    audit_conn.set_next_cursor(FakeCursor(fetchall_value=[{"id": 99}]))
    ls.write_lh_audits_from_run(audit_conn, 1, {"audits": {}})  # type: ignore[arg-type]

    # read_lh_audits_with_items
    item_conn = FakeConn()
    item_conn.set_next_cursor(
        FakeCursor(
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
                    "details_headings": [],
                    "details_meta": {},
                }
            ]
        )
    )
    audits = ls.read_lh_audits_with_items(item_conn, 1)  # type: ignore[arg-type]
    assert audits[0]["id"] == "a"

    assert ls.read_lighthouse_page_summaries(BoomConn()) == {}  # type: ignore[arg-type]


def test_llm_cache_and_report_store_branches() -> None:
    from website_profiling.db.llm_cache_store import read_llm_cache, read_llm_cache_batch
    from website_profiling.db.report_store import read_report_payload

    class BoomConn(FakeConn):
        def execute(self, sql, params=None):
            raise RuntimeError("boom")

    assert read_llm_cache(BoomConn(), "k") is None  # type: ignore[arg-type]
    assert read_llm_cache_batch(FakeConn(), []) == {}  # type: ignore[arg-type]

    conn = FakeConn()
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {"cache_key": "k1", "response_json": {"a": 1}},
                {"cache_key": "k2", "response_json": "not-json"},
            ]
        )
    )
    out = read_llm_cache_batch(conn, ["k1", "k2"])  # type: ignore[arg-type]
    assert out["k1"]["a"] == 1
    assert "k2" not in out

    rconn = FakeConn()
    rconn.set_next_cursor(FakeCursor(fetchone_value={"data": {"site": 1}}))
    assert read_report_payload(rconn, report_id=5)["site"] == 1  # type: ignore[arg-type]


def test_google_app_store_build_sa_credentials() -> None:
    from website_profiling.db.google_app_store import build_service_account_credentials

    with pytest.raises(RuntimeError, match="No service account"):
        build_service_account_credentials({"service_account_json": None})
