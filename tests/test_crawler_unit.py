def test_url_matches_exclude_prefix_and_exact() -> None:
    from website_profiling.crawl.crawler import _url_matches_exclude

    assert _url_matches_exclude("https://a.com/x", []) is False
    assert _url_matches_exclude("https://a.com/x/", ["https://a.com/x"]) is True
    assert _url_matches_exclude("https://a.com/x/y", ["https://a.com/x/"]) is True
    assert _url_matches_exclude("https://a.com/other", ["https://a.com/x"]) is False


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


def test_worker_fetch_error_returns_error_status() -> None:
    from website_profiling.crawl.crawler import Crawler

    c = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
    )
    c.fetch = lambda _url: (None, None, None, None, None, None, {}, 0)  # type: ignore[method-assign]
    out = c.worker("https://site.com/a")
    assert out["status"] == "error"

