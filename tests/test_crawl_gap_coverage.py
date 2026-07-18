"""Coverage for crawl discovery, extraction, axe, auth, and link_edges store."""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock

import pytest

from tests.db_test_fakes import CrawlConn
from tests.test_browser_fetcher_unit import _install_fake_playwright


def test_parse_crawl_url_list_resolves_relative_urls():
    from website_profiling.crawl.discovery import parse_crawl_url_list

    out = parse_crawl_url_list("/about\n, /contact", start_url="https://site.com")
    assert out == ["https://site.com/about", "https://site.com/contact"]


def test_parse_extractors_config_invalid_json():
    from website_profiling.crawl.extraction import parse_extractors_config, run_extractors

    assert parse_extractors_config("{bad") == []
    assert run_extractors("", [{"name": ""}]) == {}


def test_run_extractors_regex_css_xpath():
    from website_profiling.crawl.extraction import run_extractors

    html = """
    <html><body>
      <span id="sku">ABC</span>
      <p class="price">$12</p>
    </body></html>
    """
    specs = [
        {"name": "sku", "type": "css", "selector": "#sku"},
        {"name": "price", "type": "css", "selector": ".price"},
        {"name": "num", "type": "regex", "pattern": r"(\d+)"},
        {"name": "xpath_val", "type": "xpath", "expr": "//span[@id='sku']/text()"},
    ]
    out = run_extractors(html, specs)
    assert out["sku"] == "ABC"
    assert out["price"] == "$12"
    assert out["num"] == "12"
    assert out["xpath_val"] == "ABC"


def test_run_extractors_skips_bad_xpath():
    from website_profiling.crawl.extraction import run_extractors

    html = "<html><body>x</body></html>"
    out = run_extractors(html, [{"name": "bad", "type": "xpath", "expr": "//["}])
    assert out == {}


def test_run_extractors_skips_empty_specs():
    from website_profiling.crawl.extraction import run_extractors

    html = "<html><body><span id='x'>1</span></body></html>"
    specs = [
        {"name": "", "type": "css", "selector": "#x"},
        {"name": "missing_sel", "type": "css", "selector": ""},
        {"name": "missing_el", "type": "css", "selector": "#nope"},
        {"name": "missing_xpath", "type": "xpath", "expr": ""},
        {"name": "missing_regex", "type": "regex", "pattern": ""},
    ]
    assert run_extractors(html, specs) == {}


def test_run_axe_on_page_returns_violations():
    from website_profiling.crawl.axe_runner import run_axe_on_page

    async def _run() -> None:
        page = MagicMock()
        page.add_script_tag = AsyncMock()
        page.evaluate = AsyncMock(
            return_value=[
                {
                    "id": "color-contrast",
                    "impact": "serious",
                    "description": "Low contrast",
                    "help": "Fix colors",
                    "nodes": 2,
                }
            ]
        )
        rows = await run_axe_on_page(page)
        assert rows and rows[0]["id"] == "color-contrast"

    asyncio.run(_run())


def test_run_axe_on_page_swallows_errors():
    from website_profiling.crawl.axe_runner import run_axe_on_page

    async def _run() -> None:
        page = MagicMock()
        page.add_script_tag = AsyncMock(side_effect=RuntimeError("boom"))
        assert await run_axe_on_page(page) == []

    asyncio.run(_run())


def test_parse_link_edges_image_anchor_text():
    from website_profiling.common import parse_link_edges

    html = '<html><body><a href="/x"><img src="/i.png" alt="">Click</a></body></html>'
    _, edges = parse_link_edges("https://site.com/", html)
    assert edges[0]["anchor_text"] == "[image] Click"


def test_analyze_html_pagination_links():
    from website_profiling.analysis.page import analyze_html

    html = """
    <html><head>
      <link rel="next" href="/page/2">
      <link rel="prev" href="/page/1">
      <link rel="amphtml" href="https://site.com/amp/page/2">
    </head><body></body></html>
    """
    out = analyze_html(html, "https://site.com/page/2", "https://site.com/page/2")
    pag = out["pagination"]
    assert pag["rel_next"] == "https://site.com/page/2"
    assert pag["rel_prev"] == "https://site.com/page/1"
    assert pag["amphtml"] == "https://site.com/amp/page/2"


def test_crawler_auth_headers_and_custom_fields(monkeypatch) -> None:
    from website_profiling.crawl.crawler import Crawler
    from website_profiling.crawl.fetchers.base import FetchResult

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    captured: dict = {}

    def fake_build_fetcher(**kwargs):
        captured.update(kwargs)
        fetcher = MagicMock()
        fetcher.fetch = lambda url: FetchResult(
            status=200,
            content_type="text/html",
            text='<html><body><div class="id">99</div></body></html>',
            response_time_ms=1,
            content_length=10,
            final_url=url,
            headers_dict={},
            redirect_chain_length=0,
            fetch_method="static",
        )
        fetcher.close = lambda: None
        return fetcher

    monkeypatch.setattr("website_profiling.crawl.crawler.build_fetcher", fake_build_fetcher)

    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        crawl_auth_username="user",
        crawl_auth_password="pass",
        crawl_extra_headers="X-Test: abc\nBadLine",
        crawl_cookies="sid=1",
        crawl_robots_txt_override="User-agent: *\nDisallow:",
        custom_extractors=[{"name": "id", "type": "css", "selector": ".id"}],
    )
    assert c.session.headers["Cookie"] == "sid=1"
    assert c.session.headers["X-Test"] == "abc"
    assert c.session.auth == ("user", "pass")
    assert captured["session"] is c.session
    out = c.worker("https://site.com/page")
    fields = json.loads(out["custom_fields"])
    assert fields["id"] == "99"


def test_worker_with_llm_extractor_end_to_end(monkeypatch) -> None:
    """Full-stack proof: Crawler wiring (crawl_run_id, resolver construction,
    apply_custom_extractions) plus the real llm_selector_cache logic underneath
    it (mocked only at the AI-transport and DB-cache boundaries) resolve and
    cache a selector across two pages of the same crawl with a single AI call."""
    from website_profiling.crawl import llm_selector_cache as lsc
    from website_profiling.crawl.crawler import Crawler
    from website_profiling.crawl.fetchers.base import FetchResult

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "website_profiling.crawl.crawler.load_llm_config_from_db",
        lambda: {"llm_enabled": "true", "llm_provider": "openai"},
    )

    fake_store: dict[str, str] = {}
    from contextlib import contextmanager

    @contextmanager
    def _fake_db_session():
        yield object()

    monkeypatch.setattr(lsc, "db_session", _fake_db_session)
    monkeypatch.setattr(lsc, "read_llm_cache", lambda _conn, key: fake_store.get(key))

    def _write(_conn, key, value):
        fake_store[key] = value

    monkeypatch.setattr(lsc, "write_llm_cache", _write)

    ai_calls = []

    def fake_generate(field_name, description, html_samples, **kwargs):
        ai_calls.append(field_name)
        return {"ok": True, "type": "css", "selector": ".price", "attr": "", "confidence": 0.9, "rationale": "r"}

    monkeypatch.setattr(lsc, "generate_extraction_selector", fake_generate)

    def fake_build_fetcher(**kwargs):
        fetcher = MagicMock()
        fetcher.fetch = lambda url: FetchResult(
            status=200,
            content_type="text/html",
            text='<html><body><span class="price">$19.99</span></body></html>',
            response_time_ms=1,
            content_length=10,
            final_url=url,
            headers_dict={},
            redirect_chain_length=0,
            fetch_method="static",
        )
        fetcher.close = lambda: None
        return fetcher

    monkeypatch.setattr("website_profiling.crawl.crawler.build_fetcher", fake_build_fetcher)

    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        custom_extractors=[{"name": "price", "type": "llm", "description": "the product price"}],
    )
    # Simulate what .crawl() does before dispatching worker() calls, without
    # needing the full thread-pool/queue machinery for this wiring test.
    c.crawl_run_id = 7
    c._llm_resolver = c._build_llm_resolver_if_needed()
    assert c._llm_resolver is not None

    out1 = c.worker("https://site.com/page1")
    out2 = c.worker("https://site.com/page2")

    assert json.loads(out1["custom_fields"])["price"] == "$19.99"
    assert json.loads(out2["custom_fields"])["price"] == "$19.99"
    assert ai_calls == ["price"]  # bootstrapped once, replayed on page 2


def test_build_llm_resolver_skips_db_lookup_when_no_llm_extractors(monkeypatch) -> None:
    from website_profiling.crawl.crawler import Crawler

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "website_profiling.crawl.crawler.load_llm_config_from_db",
        lambda: (_ for _ in ()).throw(AssertionError("must not load LLM config with no llm-type extractors")),
    )
    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        custom_extractors=[{"name": "id", "type": "css", "selector": ".id"}],
    )
    assert c._build_llm_resolver_if_needed() is None


def test_build_llm_resolver_warns_once_when_llm_disabled(monkeypatch, capsys) -> None:
    from website_profiling.crawl.crawler import Crawler

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "website_profiling.crawl.crawler.load_llm_config_from_db",
        lambda: {"llm_enabled": "false"},
    )
    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        custom_extractors=[{"name": "price", "type": "llm", "description": "the price"}],
    )
    resolver = c._build_llm_resolver_if_needed()
    assert resolver is None
    out = capsys.readouterr().out
    assert "LLM disabled" in out
    assert "price" in out


def test_write_and_read_link_edges(monkeypatch) -> None:
    from website_profiling.db import crawl_store as cs

    conn = CrawlConn(fetchone={"id": 5})
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: 5)
    cs.write_link_edges(
        conn,  # type: ignore[arg-type]
        [
            {"from_url": "https://a.com/", "to_url": "https://a.com/b", "anchor_text": "B", "rel": "nofollow"},
            {"from_url": "", "to_url": "skip"},
        ],
        crawl_run_id=5,
    )
    assert any("DELETE FROM link_edges" in sql for sql, _ in conn.executed)

    read_conn = CrawlConn(
        fetchall=[
            {
                "from_url": "https://a.com",
                "to_url": "https://a.com/b",
                "anchor_text": "B",
                "rel": "nofollow",
                "is_nofollow": True,
                "is_sponsored": False,
                "is_ugc": False,
                "link_type": "internal",
            }
        ]
    )
    rows = cs.read_link_edges(read_conn, run_id=5)  # type: ignore[arg-type]
    assert rows[0]["anchor_text"] == "B"
    assert cs.read_link_edges(CrawlConn(boom_execute=True), run_id=5) == []  # type: ignore[arg-type]
    assert cs.write_link_edges(CrawlConn(), [], crawl_run_id=None) is None  # type: ignore[arg-type]
    monkeypatch.setattr(cs, "get_latest_crawl_run_id", lambda _c: None)
    assert cs.write_link_edges(CrawlConn(), [{"from_url": "a", "to_url": "b"}], crawl_run_id=None) is None  # type: ignore[arg-type]
    assert cs.read_link_edges(CrawlConn(), run_id=None) == []  # type: ignore[arg-type]


def test_create_crawl_run_raises_when_all_statements_fail() -> None:
    from website_profiling.db import crawl_store as cs

    conn = CrawlConn(boom_execute=True)
    with pytest.raises(RuntimeError, match="boom"):
        cs.create_crawl_run(conn, start_url="https://a.com")  # type: ignore[arg-type]


def test_resolve_crawl_user_agent_presets():
    from website_profiling.crawl.crawler import MOBILE_USER_AGENT, resolve_crawl_user_agent

    assert MOBILE_USER_AGENT in resolve_crawl_user_agent("mobile", None)
    assert resolve_crawl_user_agent("custom", "MyBot/2") == "MyBot/2"


def test_crawler_robots_txt_override_parses(monkeypatch) -> None:
    from website_profiling.crawl.crawler import Crawler

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr(
        "website_profiling.crawl.frontier.load_robots",
        lambda _u: (_ for _ in ()).throw(AssertionError("load_robots should not run")),
    )
    c = Crawler(
        start_url="https://site.com",
        ignore_robots=False,
        crawl_robots_txt_override="User-agent: *\nDisallow: /private",
    )
    assert c.rp is not None


def test_crawler_loads_robots_when_no_override(monkeypatch) -> None:
    from website_profiling.crawl.crawler import Crawler

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    monkeypatch.setattr("website_profiling.crawl.frontier.load_robots", lambda _u: object())
    c = Crawler(start_url="https://site.com", ignore_robots=False)
    assert c.rp is not None


def test_merge_browser_into_page_analysis_sets_axe():
    from website_profiling.crawl.fetchers.browser_diagnostics import merge_browser_into_page_analysis

    raw = merge_browser_into_page_analysis(
        "{}",
        {"axe_violations": [{"id": "label"}]},
    )
    assert "axe_violations" in raw


def test_run_crawler_writes_link_edges_after_crawl(monkeypatch) -> None:
    import types

    import pandas as pd
    import website_profiling.crawl.crawler as mod

    class FakeCrawler:
        def __init__(self, **_kwargs):
            self.link_edges_accum = [{"from_url": "https://a.com", "to_url": "https://a.com/b"}]

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200}])

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    edge_writes: list[tuple] = []

    fake_db = types.SimpleNamespace(
        backup_db_if_exists=lambda: None,
        create_crawl_run=lambda *_a, **_k: 7,
        db_session=lambda: _Ctx(),
        read_historical_data=lambda: {},
        restore_historical_data=lambda *_a, **_k: None,
        write_crawl=lambda *_a, **_k: None,
    )
    fake_storage = types.SimpleNamespace(ensure_crawl_tables_cleared=lambda *_a, **_k: None)
    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db", fake_db)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db.storage", fake_storage)
    monkeypatch.setattr(
        "website_profiling.db.crawl_store.get_latest_crawl_run_id",
        lambda _c: 9,
    )
    monkeypatch.setattr(
        "website_profiling.db.crawl_store.write_link_edges",
        lambda _conn, edges, crawl_run_id=None: edge_writes.append((edges, crawl_run_id)),
    )

    mod.run_crawler(
        "https://a.com",
        output_db=True,
        preserve_crawl_history=False,
        show_progress=False,
    )
    assert edge_writes
    assert edge_writes[0][1] == 7
    assert edge_writes[-1][1] == 7


def test_browser_fetcher_passes_auth_headers_to_context(monkeypatch):
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    captured: dict = {}

    class CapturingContext:
        async def new_page(self):
            from tests.test_browser_fetcher_unit import _FakePage

            return _FakePage()

        async def close(self):
            return None

    class CapturingBrowser:
        async def new_context(self, **kwargs):
            captured.update(kwargs)
            return CapturingContext()

        async def close(self):
            return None

    class CapturingChromium:
        async def launch(self, **_kwargs):
            return CapturingBrowser()

    class CapturingPlaywright:
        chromium = CapturingChromium()

        async def stop(self):
            return None

    class CapturingPlaywrightContext:
        async def start(self):
            return CapturingPlaywright()

    fake_api = MagicMock()
    fake_api.async_playwright = lambda: CapturingPlaywrightContext()
    monkeypatch.setitem(__import__("sys").modules, "playwright", MagicMock(async_api=fake_api))
    monkeypatch.setitem(__import__("sys").modules, "playwright.async_api", fake_api)

    fetcher = BrowserFetcher(
        timeout=5,
        js_concurrency=1,
        extra_wait_ms=0,
        block_resources=False,
        capture_console=False,
        extra_http_headers={"Cookie": "sid=1", "X-Auth": "tok"},
        http_credentials={"username": "u", "password": "p"},
    )
    try:
        fetcher.fetch("https://example.com/")
        assert captured["extra_http_headers"]["Cookie"] == "sid=1"
        assert captured["http_credentials"]["username"] == "u"
    finally:
        fetcher.close()


def test_browser_fetcher_run_axe_attaches_violations(monkeypatch):
    from website_profiling.crawl.fetchers.browser import BrowserFetcher

    _install_fake_playwright(monkeypatch)

    async def fake_axe(_page):
        return [{"id": "label", "description": "Missing label", "help": "Add label", "impact": "serious", "nodes": 1}]

    monkeypatch.setattr("website_profiling.crawl.axe_runner.run_axe_on_page", fake_axe)

    fetcher = BrowserFetcher(
        timeout=5,
        js_concurrency=1,
        extra_wait_ms=0,
        block_resources=False,
        capture_console=False,
        run_axe=True,
    )
    try:
        result = fetcher.fetch("https://example.com/")
        assert result.browser_diagnostics is not None
        assert result.browser_diagnostics["axe_violations"][0]["id"] == "label"
    finally:
        fetcher.close()
