"""Unit tests for crawl fetchers, sitemap discovery, browser deps, and config loading."""
from __future__ import annotations

import json
import subprocess
import sys
import types
from pathlib import Path
from unittest.mock import MagicMock

import pandas as pd
import pytest

from website_profiling.crawl.fetchers.base import FetchResult, HEADER_KEYS
from website_profiling.crawl.fetchers.static import StaticFetcher


def _static_result(html: str, **kwargs) -> FetchResult:
    defaults = dict(
        status=200,
        content_type="text/html",
        text=html,
        response_time_ms=1,
        content_length=len(html),
        final_url="https://example.com/",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="static",
    )
    defaults.update(kwargs)
    return FetchResult(**defaults)  # type: ignore[arg-type]


def test_fetch_result_as_tuple():
    r = _static_result("<html></html>")
    t = r.as_tuple()
    assert t[0] == 200
    assert t[6] == r.headers_dict


def test_static_fetcher_network_error_returns_empty_result():
    import requests as req_module

    class BoomSession:
        headers = {}

        def get(self, *_a, **_k):
            raise req_module.exceptions.ConnectionError("offline")

        def close(self):
            pass

    f = StaticFetcher(session=BoomSession())  # type: ignore[arg-type]
    try:
        out = f.fetch("https://example.com")
        assert out.status is None
        assert out.text is None
    finally:
        f.close()


def test_hybrid_fetch_returns_static_when_no_spa():
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    static_html = "<html><body><h1>Normal page with enough text content here</h1></body></html>"

    class FakeStatic:
        def fetch(self, _url):
            return _static_result(static_html)

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            raise AssertionError("browser should not run")

        def close(self):
            pass

    h = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = h.fetch("https://example.com/")
        assert out.text == static_html
    finally:
        h.close()


def test_hybrid_fetch_falls_back_when_browser_fails():
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    static = _static_result('<html><div id="root"></div></body></html>')
    fail = FetchResult(
        status=None,
        content_type=None,
        text=None,
        response_time_ms=None,
        content_length=None,
        final_url=None,
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="rendered",
    )

    class FakeStatic:
        def fetch(self, _url):
            return static

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            return fail

        def close(self):
            pass

    h = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = h.fetch("https://example.com/")
        assert out is static
    finally:
        h.close()


def test_hybrid_refetch_falls_back_to_static_on_browser_failure():
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    static = _static_result("<html>static ok</html>")
    fail = FetchResult(
        status=None,
        content_type=None,
        text=None,
        response_time_ms=None,
        content_length=None,
        final_url=None,
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="rendered",
    )

    class FakeStatic:
        def fetch(self, _url):
            return static

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            return fail

        def close(self):
            pass

    h = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = h.refetch_rendered("https://example.com/")
        assert "static ok" in (out.text or "")
    finally:
        h.close()


def test_spa_heuristics_script_heavy_shell():
    from website_profiling.crawl.fetchers.spa_heuristics import needs_js_render

    scripts = "".join("<script src='s.js'></script>" for _ in range(10))
    html = f"<html><body>{scripts}<p>tiny</p></body></html>"
    assert needs_js_render(_static_result(html)) is True


def test_spa_heuristics_low_word_count_with_scripts():
    from website_profiling.crawl.fetchers.spa_heuristics import needs_js_render

    scripts = "".join("<script></script>" for _ in range(4))
    html = "x" * 2000 + scripts
    assert needs_js_render(_static_result(html)) is True


def test_spa_heuristics_word_count_parse_error(monkeypatch):
    from website_profiling.crawl.fetchers import spa_heuristics

    def boom(_html):
        raise RuntimeError("parse fail")

    import bs4

    monkeypatch.setattr(bs4, "BeautifulSoup", boom)
    assert spa_heuristics._html_word_count("<html>x</html>") == 0


def test_spa_heuristics_after_parse_empty_html():
    from website_profiling.crawl.fetchers.spa_heuristics import needs_js_render_after_parse

    assert needs_js_render_after_parse(_static_result(""), link_count=0, same_domain_link_count=0) is False


def test_spa_heuristics_after_parse_many_same_domain_links():
    from website_profiling.crawl.fetchers.spa_heuristics import needs_js_render_after_parse

    html = '<html><div id="root"></div><script></script></html>'
    assert needs_js_render_after_parse(
        _static_result(html), link_count=0, same_domain_link_count=2
    ) is False


def test_sitemap_origin_invalid():
    from website_profiling.crawl.sitemap import _origin, discover_sitemap_urls

    assert _origin("not-a-url") == ""
    assert discover_sitemap_urls("not-a-url") == []


def test_sitemap_parse_invalid_xml():
    from website_profiling.crawl.sitemap import _parse_sitemap_xml

    pages, nested = _parse_sitemap_xml("not xml", "https://example.com/sm.xml")
    assert pages == []
    assert nested == []


def test_sitemap_parse_sitemap_index():
    from website_profiling.crawl.sitemap import _parse_sitemap_xml

    xml = """<?xml version="1.0"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://example.com/sitemap-2.xml</loc></sitemap>
    </sitemapindex>"""
    pages, nested = _parse_sitemap_xml(xml, "https://example.com/sitemap.xml")
    assert pages == []
    assert "https://example.com/sitemap-2.xml" in nested


def test_discover_sitemap_skips_bad_responses(monkeypatch):
    from website_profiling.crawl.sitemap import discover_sitemap_urls

    class FakeResp:
        def __init__(self, code, text=""):
            self.status_code = code
            self.text = text

    class FakeSession:
        headers = {}

        def get(self, url, timeout=0):
            if url.endswith("/robots.txt"):
                raise ConnectionError("robots down")
            if url.endswith("/sitemap.xml"):
                return FakeResp(404, "")
            return FakeResp(404, "")

        def close(self):
            pass

    monkeypatch.setattr("website_profiling.crawl.sitemap.requests.Session", lambda: FakeSession())
    urls = discover_sitemap_urls("https://example.com")
    assert urls == []


def test_discover_sitemap_nested_and_external_filter(monkeypatch):
    from website_profiling.crawl.sitemap import discover_sitemap_urls

    class FakeResp:
        def __init__(self, code, text):
            self.status_code = code
            self.text = text

    class FakeSession:
        headers = {}
        calls = 0

        def get(self, url, timeout=0):
            if url.endswith("/robots.txt"):
                return FakeResp(200, "Sitemap: https://example.com/index.xml\n")
            if url.endswith("/index.xml"):
                return FakeResp(
                    200,
                    """<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                    <sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>""",
                )
            if url.endswith("/pages.xml"):
                return FakeResp(
                    200,
                    """<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                    <url><loc>https://example.com/p1</loc></url>
                    <url><loc>https://other.com/p2</loc></url></urlset>""",
                )
            return FakeResp(404, "")

        def close(self):
            pass

    monkeypatch.setattr("website_profiling.crawl.sitemap.requests.Session", lambda: FakeSession())
    urls = discover_sitemap_urls("https://example.com", max_urls=10)
    assert "https://example.com/p1" in urls
    assert all("other.com" not in u for u in urls)


def test_discover_sitemap_rejects_offorigin_nested_and_robots(monkeypatch):
    # robots.txt and nested <sitemap><loc> entries are attacker-controllable;
    # an off-origin sitemap URL must never be fetched (SSRF / scope escape).
    from website_profiling.crawl.sitemap import discover_sitemap_urls

    fetched: list[str] = []

    class FakeResp:
        def __init__(self, code, text):
            self.status_code = code
            self.text = text

    class FakeSession:
        headers = {}

        def get(self, url, timeout=0):
            fetched.append(url)
            if url.endswith("/robots.txt"):
                return FakeResp(
                    200,
                    "Sitemap: https://evil.com/evil.xml\n"
                    "Sitemap: https://example.com/index.xml\n",
                )
            if url.endswith("/index.xml"):
                return FakeResp(
                    200,
                    """<?xml version="1.0"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                    <sitemap><loc>https://evil.com/nested.xml</loc></sitemap>
                    <sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>""",
                )
            if url.endswith("/pages.xml"):
                return FakeResp(
                    200,
                    """<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                    <url><loc>https://example.com/p1</loc></url></urlset>""",
                )
            return FakeResp(404, "")

        def close(self):
            pass

    monkeypatch.setattr("website_profiling.crawl.sitemap.requests.Session", lambda: FakeSession())
    urls = discover_sitemap_urls("https://example.com", max_urls=10)
    assert "https://example.com/p1" in urls
    # Neither the robots-advertised nor the nested off-origin sitemap was fetched.
    assert all("evil.com" not in u for u in fetched)


def test_pip_install_browser_requirements_runs_subprocess(monkeypatch, tmp_path):
    from website_profiling.crawl.fetchers import browser_deps

    monkeypatch.setenv("WEBSITE_PROFILING_ROOT", str(tmp_path))
    called: list = []

    def fake_run(cmd, **kwargs):
        called.append(cmd)

    monkeypatch.setattr(browser_deps.subprocess, "run", fake_run)
    browser_deps._pip_install_browser_requirements()
    assert called and "playwright>=1.49.0" in called[0]


def test_playwright_install_chromium_runs_subprocess(monkeypatch, tmp_path):
    from website_profiling.crawl.fetchers import browser_deps

    monkeypatch.setenv("WEBSITE_PROFILING_ROOT", str(tmp_path))
    called: list = []

    def fake_run(cmd, **kwargs):
        called.append(cmd)

    monkeypatch.setattr(browser_deps.subprocess, "run", fake_run)
    browser_deps._playwright_install_chromium()
    assert called and "playwright" in called[0]


def test_config_get_int_float_list_invalid():
    from website_profiling.config import get_float, get_int, get_list

    assert get_int({"n": "bad"}, "n", 5) == 5
    assert get_float({"f": "bad"}, "f", 1.5) == 1.5
    assert get_list({"l": ""}, "l") == []
    assert get_list({"l": "a,b"}, "l") == ["a", "b"]


def test_load_config_missing_file(tmp_path):
    from website_profiling.config import load_config

    assert load_config(str(tmp_path / "missing.txt")) == {}


def test_load_config_from_db_no_database_url(monkeypatch):
    from website_profiling.config import load_config_from_db

    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert load_config_from_db() == {}


def test_load_config_from_db_runtime_error(monkeypatch, capsys):
    from website_profiling.config import load_config_from_db

    monkeypatch.setenv("DATABASE_URL", "postgres://x")
    monkeypatch.setattr(
        "website_profiling.db.storage.get_database_url",
        lambda: (_ for _ in ()).throw(RuntimeError("no url")),
    )
    assert load_config_from_db() == {}
    assert "no url" in capsys.readouterr().err


def test_load_config_from_db_query_error(monkeypatch, capsys):
    from website_profiling.config import load_config_from_db

    monkeypatch.setenv("DATABASE_URL", "postgres://x")
    monkeypatch.setattr("website_profiling.db.storage.get_database_url", lambda: "postgres://x")

    def boom():
        raise OSError("db")

    monkeypatch.setattr("website_profiling.db.db_session", boom)
    assert load_config_from_db() == {}
    assert "PostgreSQL" in capsys.readouterr().err


def test_property_store_extract_hostname_invalid():
    from website_profiling.db import property_store

    assert property_store._extract_hostname("://bad") == ""


def test_browser_diagnostics_merge_and_aggregate():
    from website_profiling.crawl.fetchers.browser_diagnostics import (
        aggregate_browser_diagnostics_df,
        browser_summary_from_page_analysis,
        merge_browser_into_page_analysis,
        truncate_diag_text,
    )

    assert merge_browser_into_page_analysis(None, None) == "{}"
    diag = {"summary": {"console_error_count": 1, "page_error_count": 0}}
    merged = json.loads(merge_browser_into_page_analysis('{"x":1}', diag))
    assert merged["browser"]["summary"]["console_error_count"] == 1

    assert browser_summary_from_page_analysis({})["console_error_count"] == 0

    long = "z" * 600
    assert len(truncate_diag_text(long)) == 500

    pa = json.dumps(
        {
            "browser": {
                "console": [{"level": "error", "text": "err"}],
                "page_errors": [],
                "summary": {"console_error_count": 1, "page_error_count": 0},
            }
        }
    )
    df = pd.DataFrame([{"url": "https://a.com", "page_analysis": pa}])
    agg = aggregate_browser_diagnostics_df(df)
    assert agg["pages_with_console_errors"] == 1
    assert agg["top_console_messages"][0]["text"] == "err"


def test_browser_diagnostics_aggregate_skips_empty_messages():
    from website_profiling.crawl.fetchers.browser_diagnostics import aggregate_browser_diagnostics_df

    pa = json.dumps(
        {
            "browser": {
                "console": [{"level": "error", "text": "  "}],
                "summary": {"console_error_count": 1},
            }
        }
    )
    df = pd.DataFrame([{"url": "https://a.com", "page_analysis": pa}])
    agg = aggregate_browser_diagnostics_df(df)
    assert agg.get("top_console_messages", []) == []


def test_browser_diagnostics_parse_cell_nan():
    from website_profiling.crawl.fetchers.browser_diagnostics import _parse_page_analysis_cell

    assert _parse_page_analysis_cell(float("nan")) == {}
    assert _parse_page_analysis_cell("{}") == {}
    assert _parse_page_analysis_cell("not-json") == {}
    assert _parse_page_analysis_cell('["list"]') == {}


def test_browser_diagnostics_aggregate_empty_df():
    from website_profiling.crawl.fetchers.browser_diagnostics import aggregate_browser_diagnostics_df

    assert aggregate_browser_diagnostics_df(None) == {}
    assert aggregate_browser_diagnostics_df(pd.DataFrame()) == {}


def test_browser_diagnostics_aggregate_failed_requests_and_page_error_skips():
    from website_profiling.crawl.fetchers.browser_diagnostics import aggregate_browser_diagnostics_df

    pa = json.dumps(
        {
            "browser": {
                "failed_requests": [{"url": "https://a.com/fail"}],
                "page_errors": ["not-a-dict", {"message": "  "}, {"message": "real error"}],
            }
        }
    )
    df = pd.DataFrame([{"url": "https://a.com", "page_analysis": pa}])
    agg = aggregate_browser_diagnostics_df(df)
    assert agg["pages_with_failed_requests"] == 1
    assert agg["total_failed_requests"] == 1
    assert agg["pages_with_page_errors"] == 1
    assert agg["top_page_errors"][0]["text"] == "real error"
