"""Thread-safety of crawler HTTP sessions.

`requests.Session` is not documented as thread-safe, so the crawler must hand
each worker thread its own session. These tests pin that behaviour down on the
`StaticFetcher` (per-thread sessions, lifecycle) and the `Crawler` wiring.
"""
from __future__ import annotations

import threading

import requests

from website_profiling.crawl.fetchers.factory import build_fetcher
from website_profiling.crawl.fetchers.static import StaticFetcher


class _FakeResp:
    def __init__(self, status: int, content_type: str, body: str | None) -> None:
        self.status_code = status
        self.headers = {"Content-Type": content_type}
        self.text = body
        self.content = body.encode() if body is not None else None
        self.url = "https://example.com/final"
        self.history: list = []


def test_static_fetcher_session_is_per_thread_and_reused() -> None:
    built: list = []

    def factory() -> requests.Session:
        sess = requests.Session()
        built.append(sess)
        return sess

    fetcher = StaticFetcher(session_factory=factory)
    try:
        main_first = fetcher.session
        # Second access on the same thread reuses the cached session.
        main_second = fetcher.session
        assert main_first is main_second

        seen: dict[str, requests.Session] = {}

        def grab(name: str) -> None:
            seen[name] = fetcher.session

        t1 = threading.Thread(target=grab, args=("t1",))
        t2 = threading.Thread(target=grab, args=("t2",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        # Each thread got a distinct session, none shared with the main thread.
        assert seen["t1"] is not seen["t2"]
        assert seen["t1"] is not main_first
        assert seen["t2"] is not main_first
        # main thread + two worker threads => three builds.
        assert len(built) == 3
    finally:
        fetcher.close()


def test_static_fetcher_close_closes_owned_sessions() -> None:
    closed: list = []

    class FakeSession:
        def close(self) -> None:
            closed.append(self)

    fetcher = StaticFetcher(session_factory=lambda: FakeSession())
    owned = fetcher.session
    fetcher.close()
    assert closed == [owned]
    # close() is idempotent: tracked sessions are cleared after the first call.
    fetcher.close()
    assert closed == [owned]


def test_static_fetcher_explicit_session_is_shared_and_not_closed() -> None:
    closed: list = []

    class FakeSession:
        headers: dict = {}

        def close(self) -> None:
            closed.append(self)

    sess = FakeSession()
    fetcher = StaticFetcher(session=sess)
    assert fetcher.session is sess

    grabbed: dict = {}

    def grab() -> None:
        grabbed["worker"] = fetcher.session

    t = threading.Thread(target=grab)
    t.start()
    t.join()
    # Legacy explicit session is shared as-is across threads.
    assert grabbed["worker"] is sess

    fetcher.close()
    # The caller owns an explicit session, so the fetcher must not close it.
    assert closed == []


def test_static_fetcher_default_factory_sets_user_agent() -> None:
    fetcher = StaticFetcher(user_agent="MyBot/9")
    try:
        assert fetcher.session.headers["User-Agent"] == "MyBot/9"
    finally:
        fetcher.close()


def test_static_fetcher_fetch_success_non_html_and_error() -> None:
    class OkSession:
        def get(self, url, timeout, allow_redirects, stream=False):  # noqa: ANN001
            return _FakeResp(200, "text/html", "<html>ok</html>")

        def close(self) -> None:
            pass

    fetcher = StaticFetcher(session_factory=lambda: OkSession())
    try:
        ok = fetcher.fetch("https://example.com")
        assert ok.status == 200
        assert ok.text == "<html>ok</html>"
        assert ok.final_url == "https://example.com/final"
    finally:
        fetcher.close()

    class NonHtmlSession:
        def get(self, url, timeout, allow_redirects, stream=False):  # noqa: ANN001
            # 404 + empty body exercises the non-HTML and content-is-None paths.
            return _FakeResp(404, "application/json", None)

        def close(self) -> None:
            pass

    non_html = StaticFetcher(session_factory=lambda: NonHtmlSession())
    try:
        res = non_html.fetch("https://example.com")
        assert res.status == 404
        assert res.text is None
        assert res.content_length == 0
    finally:
        non_html.close()

    class BoomSession:
        def get(self, url, timeout, allow_redirects, stream=False):  # noqa: ANN001
            raise requests.RequestException("boom")

        def close(self) -> None:
            pass

    boom = StaticFetcher(session_factory=lambda: BoomSession())
    try:
        err = boom.fetch("https://example.com")
        assert err.status is None
        assert err.fetch_method == "static"
    finally:
        boom.close()


def test_build_fetcher_forwards_session_factory() -> None:
    calls: list = []

    def factory() -> requests.Session:
        calls.append(1)
        return requests.Session()

    fetcher = build_fetcher(render_mode="static", session_factory=factory)
    try:
        assert isinstance(fetcher, StaticFetcher)
        assert fetcher.session is not None
        assert calls  # the factory, not the (absent) shared session, was used
    finally:
        fetcher.close()


def test_crawler_serves_distinct_configured_sessions_per_thread(monkeypatch) -> None:
    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    from website_profiling.crawl.crawler import Crawler

    crawler = Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        use_wappalyzer=False,
        crawl_auth_username="user",
        crawl_auth_password="pass",
        crawl_extra_headers="X-Test: abc",
        crawl_cookies="sid=1",
    )

    # A fresh session from the factory is a distinct object configured exactly
    # like the main-thread template.
    spawned = crawler._session_factory()
    assert spawned is not crawler.session
    assert spawned.headers["User-Agent"] == crawler.session.headers["User-Agent"]
    assert spawned.headers["X-Test"] == "abc"
    assert spawned.headers["Cookie"] == "sid=1"
    assert spawned.auth == ("user", "pass")

    # The static fetcher never reuses the main-thread template for fetching.
    assert crawler.fetcher.session is not crawler.session
    assert crawler.fetcher.session.headers["Cookie"] == "sid=1"
