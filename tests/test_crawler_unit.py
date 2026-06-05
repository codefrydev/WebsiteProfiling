import pytest


@pytest.fixture(autouse=True)
def _mock_sitemap_unless_seeding_test(monkeypatch, request):
    if request.node.name == "test_crawler_seeds_sitemap_urls":
        return
    monkeypatch.setattr(
        "website_profiling.crawl.crawler.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )


def test_url_matches_exclude_prefix_and_exact() -> None:
    from website_profiling.crawl.crawler import _url_matches_exclude

    assert _url_matches_exclude("https://a.com/x", []) is False
    assert _url_matches_exclude("https://a.com/x/", ["https://a.com/x"]) is True
    assert _url_matches_exclude("https://a.com/x/y", ["https://a.com/x/"]) is True
    assert _url_matches_exclude("https://a.com/other", ["https://a.com/x"]) is False


def test_crawler_seeds_sitemap_urls(monkeypatch) -> None:
    from website_profiling.crawl.crawler import Crawler

    monkeypatch.setattr(
        "website_profiling.crawl.crawler.discover_sitemap_urls",
        lambda *_a, **_k: ["https://site.com/from-sitemap"],
    )
    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
    )
    queued = []
    while not c.queue.empty():
        queued.append(c.queue.get())
    assert "https://site.com/from-sitemap" in queued
    assert c.depths.get("https://site.com/from-sitemap") == 0


def test_crawler_init_respects_exclude_and_same_domain() -> None:
    from website_profiling.crawl.crawler import Crawler

    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        exclude_urls=["https://site.com"],
    )
    assert c.queue.qsize() == 0

    c2 = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        exclude_urls=["https://site.com/skip"],
    )
    assert c2.queue.qsize() == 1
    assert c2.same_domain("https://site.com/a") is True
    assert c2.same_domain("https://other.com/a") is False


def test_worker_blocked_by_robots_returns_stub_fields() -> None:
    from website_profiling.crawl.crawler import Crawler

    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        store_outlinks=True,
    )
    # Force block
    c.allowed_by_robots = lambda _url: False  # type: ignore[method-assign]
    out = c.worker("https://site.com/a")
    assert out["status"] == "blocked_by_robots"
    assert "outlink_targets" in out


def test_worker_fetch_error_returns_error_status(monkeypatch) -> None:
    from website_profiling.crawl.crawler import Crawler
    from website_profiling.crawl.fetchers.base import FetchResult

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
    )
    c.fetch = lambda _url: FetchResult(  # type: ignore[method-assign]
        status=None,
        content_type=None,
        text=None,
        response_time_ms=None,
        content_length=None,
        final_url=None,
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="static",
    )
    out = c.worker("https://site.com/a")
    assert out["status"] == "error"


def test_worker_merges_browser_diagnostics_into_page_analysis(monkeypatch) -> None:
    import json

    from website_profiling.crawl.crawler import Crawler
    from website_profiling.crawl.fetchers.base import FetchResult

    diagnostics = {
        "console": [{"level": "error", "text": "boom"}],
        "page_errors": [],
        "failed_requests": [],
        "summary": {"console_error_count": 1, "console_warning_count": 0, "page_error_count": 0},
    }
    html = "<html><head><title>T</title></head><body><a href='/b'>link</a></body></html>"
    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
    )
    c.fetch = lambda _url: FetchResult(  # type: ignore[method-assign]
        status=200,
        content_type="text/html",
        text=html,
        response_time_ms=10,
        content_length=len(html),
        final_url="https://site.com/a",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="rendered",
        browser_diagnostics=diagnostics,
    )
    out = c.worker("https://site.com/a")
    pa = json.loads(out["page_analysis"])
    assert pa["browser"]["summary"]["console_error_count"] == 1
    assert pa.get("internal_link_count") is not None


def test_worker_auto_post_parse_refetches_when_few_links(monkeypatch) -> None:
    from pathlib import Path

    from website_profiling.crawl.crawler import Crawler
    from website_profiling.crawl.fetchers.base import FetchResult

    fixtures = Path(__file__).resolve().parent / "fixtures"
    html = (fixtures / "post_parse_shell.html").read_text(encoding="utf-8")
    rendered_html = (
        html.replace("</body>", '<a href="https://site.com/discovered-by-js">js</a></body>')
    )
    static_result = FetchResult(
        status=200,
        content_type="text/html",
        text=html,
        response_time_ms=5,
        content_length=len(html),
        final_url="https://site.com/",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="static",
    )
    rendered_result = FetchResult(
        status=200,
        content_type="text/html; charset=utf-8",
        text=rendered_html,
        response_time_ms=50,
        content_length=len(rendered_html),
        final_url="https://site.com/rendered",
        headers_dict={"Cache-Control": "rendered"},
        redirect_chain_length=1,
        fetch_method="rendered",
    )

    class DummyFetcher:
        def fetch(self, _url):
            return static_result

        def close(self):
            pass

    class FakeHybrid:
        def refetch_rendered(self, _url):
            return rendered_result

    monkeypatch.setattr(
        "website_profiling.crawl.crawler.build_fetcher",
        lambda **_kwargs: DummyFetcher(),
    )
    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        render_mode="auto",
        store_outlinks=True,
    )
    c._hybrid_fetcher = FakeHybrid()
    out = c.worker("https://site.com/")
    assert out["fetch_method"] == "rendered"
    assert out["outlinks"] >= 1
    assert "discovered-by-js" in str(out.get("outlink_targets", ""))
    assert out["response_time_ms"] == 50
    assert out["cache_control"] == "rendered"
    assert out["final_url"] == "https://site.com/rendered"
    assert out["redirect_chain_length"] == 1


def test_worker_error_path_stores_browser_diagnostics_only(monkeypatch) -> None:
    import json

    from website_profiling.crawl.crawler import Crawler
    from website_profiling.crawl.fetchers.base import FetchResult

    diagnostics = {
        "console": [{"level": "error", "text": "fetch failed"}],
        "page_errors": [],
        "failed_requests": [],
        "summary": {"console_error_count": 1, "console_warning_count": 0, "page_error_count": 0},
    }
    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
    )
    c.fetch = lambda _url: FetchResult(  # type: ignore[method-assign]
        status=None,
        content_type=None,
        text=None,
        response_time_ms=None,
        content_length=None,
        final_url="https://site.com/a",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="rendered",
        browser_diagnostics=diagnostics,
    )
    out = c.worker("https://site.com/a")
    assert out["status"] == "error"
    pa = json.loads(out["page_analysis"])
    assert pa["browser"]["summary"]["console_error_count"] == 1

