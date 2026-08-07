"""Unit tests for crawl frontier (no network)."""

from website_profiling.crawl.config import CrawlConfig
from website_profiling.crawl.frontier import CrawlFrontier, url_matches_exclude


def test_url_matches_exclude_prefix() -> None:
    assert url_matches_exclude("https://a.com/blog/post", ["https://a.com/blog"])
    assert not url_matches_exclude("https://a.com/about", ["https://a.com/blog"])
    assert url_matches_exclude("https://a.com/blog", ["https://a.com/blog"])


def test_enqueue_seed_respects_exclude_and_domain() -> None:
    frontier = CrawlFrontier(
        "https://example.com",
        exclude_urls=["https://example.com/private"],
        allow_external=False,
    )
    frontier.enqueue_seed("https://example.com/page", 0)
    frontier.enqueue_seed("https://other.com/page", 0)
    frontier.enqueue_seed("https://example.com/private", 0)
    assert frontier.queue.qsize() == 1
    assert frontier.depths["https://example.com/page"] == 0


def test_try_enqueue_link_depth_limit() -> None:
    frontier = CrawlFrontier("https://example.com", max_depth=0, follow_links=True)
    frontier.depths["https://example.com"] = 0
    assert frontier.try_enqueue_link("https://example.com/child", "https://example.com") is False

    frontier.max_depth = 1
    assert frontier.try_enqueue_link("https://example.com/child", "https://example.com") is True
    assert frontier.depths["https://example.com/child"] == 1


def test_mark_visited_dedupes() -> None:
    frontier = CrawlFrontier("https://example.com")
    assert frontier.mark_visited("https://example.com/a") is True
    assert frontier.mark_visited("https://example.com/a") is False


def test_try_enqueue_link_skips_already_visited() -> None:
    frontier = CrawlFrontier("https://example.com", follow_links=True)
    frontier.depths["https://example.com"] = 0
    frontier.visited.add("https://example.com/child")
    assert frontier.try_enqueue_link("https://example.com/child", "https://example.com") is False


def test_try_enqueue_link_dedupes_concurrent_enqueue() -> None:
    import threading

    frontier = CrawlFrontier("https://example.com", follow_links=True)
    frontier.depths["https://example.com"] = 0
    link = "https://example.com/child"
    results: list[bool] = []

    def _enqueue() -> None:
        results.append(frontier.try_enqueue_link(link, "https://example.com"))

    threads = [threading.Thread(target=_enqueue) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sum(results) == 1
    assert frontier.queue.qsize() == 1


def test_crawl_config_javascript_render_properties() -> None:
    cfg = CrawlConfig(
        start_url="https://example.com",
        render_mode="javascript",
        js_concurrency=5,
        concurrency=10,
    )
    assert cfg.effective_concurrency == 5
    assert cfg.fetcher_render_mode == "javascript"
