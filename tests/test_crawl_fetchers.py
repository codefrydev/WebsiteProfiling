from __future__ import annotations

from pathlib import Path

import pytest

from website_profiling.crawl.fetchers.base import FetchResult
from website_profiling.crawl.fetchers.bot_block import is_bot_block_status
from website_profiling.crawl.fetchers.browser_deps import ensure_browser_deps
from website_profiling.crawl.fetchers.factory import browser_status, build_fetcher, validate_browser_available
from website_profiling.crawl.fetchers.spa_heuristics import needs_js_render, needs_js_render_after_parse
from website_profiling.crawl.fetchers.static import StaticFetcher
from website_profiling.crawl.sitemap import discover_sitemap_urls, _parse_sitemap_xml


FIXTURES = Path(__file__).resolve().parent / "fixtures"


def _static_result(
    html: str,
    *,
    fetch_method: str = "static",
    status: int = 200,
    retry_after_header: str = "",
) -> FetchResult:
    return FetchResult(
        status=status,
        content_type="text/html",
        text=html,
        response_time_ms=1,
        content_length=len(html),
        final_url="https://example.com/",
        headers_dict={},
        redirect_chain_length=0,
        fetch_method=fetch_method,  # type: ignore[arg-type]
        retry_after_header=retry_after_header,
    )


def test_static_fetcher_parses_html():
    fetcher = StaticFetcher(timeout=5)
    try:
        result = fetcher.fetch("https://example.com")
    finally:
        fetcher.close()
    assert isinstance(result, FetchResult)
    assert result.fetch_method == "static"
    assert result.browser_diagnostics is None


class _FakeResp:
    def __init__(self, status_code, headers=None, text="", url="", body_bytes=None):
        self.status_code = status_code
        self.headers = headers or {}
        self.text = text
        self.content = body_bytes if body_bytes is not None else text.encode("utf-8")
        self.url = url
        self.history = []
        self._body_bytes = body_bytes if body_bytes is not None else self.content
        self.closed = False

    def iter_content(self, chunk_size=65536):
        data = self._body_bytes
        for i in range(0, len(data), chunk_size):
            yield data[i : i + chunk_size]

    def close(self):
        self.closed = True

    @property
    def is_redirect(self):
        return self.status_code in (301, 302, 303, 307, 308) and "Location" in self.headers

    @property
    def is_permanent_redirect(self):
        return self.status_code in (301, 308) and "Location" in self.headers


class _FakeSession:
    def __init__(self, resp):
        self._resp = resp
        self.headers = {}
        self.calls = []

    def get(self, url, timeout=None, allow_redirects=True, stream=False):
        self.calls.append({"url": url, "allow_redirects": allow_redirects, "stream": stream})
        return self._resp

    def close(self):
        pass


def test_static_fetcher_records_permanent_redirect_without_following():
    resp = _FakeResp(
        301,
        headers={"Location": "https://example.com/new", "Content-Type": "text/html"},
        text="<html>ignored redirect body</html>",
        url="https://example.com/old",
    )
    session = _FakeSession(resp)
    fetcher = StaticFetcher(timeout=5, session=session)
    result = fetcher.fetch("https://example.com/old")

    # The redirect must NOT be followed: status is the real 301, not the dest's 200.
    assert session.calls[0]["allow_redirects"] is False
    assert result.status == 301
    assert result.final_url == "https://example.com/new"
    assert result.text is None
    assert result.redirect_chain_length == 1


def test_static_fetcher_resolves_relative_redirect_location():
    resp = _FakeResp(
        308,
        headers={"Location": "/moved"},
        url="https://example.com/old",
    )
    fetcher = StaticFetcher(timeout=5, session=_FakeSession(resp))
    result = fetcher.fetch("https://example.com/old")
    assert result.status == 308
    assert result.final_url == "https://example.com/moved"


def test_static_fetcher_records_client_error_and_captures_body():
    resp = _FakeResp(
        400,
        headers={"Content-Type": "text/html"},
        text="<html><head><title>Bad Request</title></head></html>",
        url="https://example.com/bad",
    )
    fetcher = StaticFetcher(timeout=5, session=_FakeSession(resp))
    result = fetcher.fetch("https://example.com/bad")
    assert result.status == 400
    # Non-200 HTML body is now captured so custom error pages can be analysed.
    assert result.text is not None and "Bad Request" in result.text
    assert result.redirect_chain_length == 0


@pytest.mark.parametrize("status,expected", [
    (401, True), (403, True), (429, True), (503, True),
    (200, False), (301, False), (404, False), (500, False), (502, False),
    (None, False), ("error", False),
])
def test_is_bot_block_status_matches_expected_codes(status, expected):
    assert is_bot_block_status(status) is expected


def test_static_fetcher_captures_retry_after_header():
    resp = _FakeResp(
        429,
        headers={"Content-Type": "text/html", "Retry-After": "5"},
        text="<html>slow down</html>",
        url="https://example.com/limited",
    )
    fetcher = StaticFetcher(timeout=5, session=_FakeSession(resp))
    result = fetcher.fetch("https://example.com/limited")
    assert result.status == 429
    assert result.retry_after_header == "5"


def test_static_fetcher_reads_pdf_body_within_budget():
    pdf_bytes = b"%PDF-1.4 fake pdf content"
    resp = _FakeResp(
        200,
        headers={"Content-Type": "application/pdf", "Content-Length": str(len(pdf_bytes))},
        url="https://example.com/doc.pdf",
        body_bytes=pdf_bytes,
    )
    fetcher = StaticFetcher(timeout=5, session=_FakeSession(resp), max_pdf_bytes=1000)
    result = fetcher.fetch("https://example.com/doc.pdf")
    assert result.status == 200
    assert result.raw_bytes == pdf_bytes
    assert result.text is None
    assert result.content_length == len(pdf_bytes)


def test_static_fetcher_rejects_pdf_over_content_length_cap():
    resp = _FakeResp(
        200,
        headers={"Content-Type": "application/pdf", "Content-Length": "99999999"},
        url="https://example.com/huge.pdf",
        body_bytes=b"never read",
    )
    fetcher = StaticFetcher(timeout=5, session=_FakeSession(resp), max_pdf_bytes=1000)
    result = fetcher.fetch("https://example.com/huge.pdf")
    assert result.raw_bytes is None
    assert result.content_length == 99999999
    assert resp.closed is True


def test_static_fetcher_truncates_pdf_when_length_header_missing():
    big_pdf = b"x" * 5000
    resp = _FakeResp(
        200,
        headers={"Content-Type": "application/pdf"},  # no Content-Length
        url="https://example.com/big.pdf",
        body_bytes=big_pdf,
    )
    fetcher = StaticFetcher(timeout=5, session=_FakeSession(resp), max_pdf_bytes=1000)
    result = fetcher.fetch("https://example.com/big.pdf")
    assert result.raw_bytes is None  # streamed past the cap, bailed out


def test_page_diagnostics_collector_builds_summary():
    from website_profiling.crawl.fetchers.browser import _PageDiagnosticsCollector

    collector = _PageDiagnosticsCollector(
        capture_console=True,
        console_levels=frozenset({"error", "warning"}),
        capture_failed_requests=False,
        max_per_page=20,
    )

    class FakeLoc:
        url = "https://example.com/app.js"
        lineNumber = 12

    class FakeMsg:
        type = "error"
        text = "Something broke"
        location = FakeLoc()

    class FakeErr:
        def __str__(self):
            return "Uncaught TypeError"

        stack = "Error: Uncaught TypeError\n    at main.js:1:1"

    collector.console.append(
        {
            "level": "error",
            "text": FakeMsg.text,
            "source_url": FakeLoc.url,
            "line": FakeLoc.lineNumber,
        }
    )
    collector.page_errors.append(
        {"message": str(FakeErr()), "stack": FakeErr.stack}
    )
    diag = collector.build()
    assert diag["summary"]["console_error_count"] == 1
    assert diag["summary"]["page_error_count"] == 1
    assert len(diag["console"]) == 1
    assert len(diag["page_errors"]) == 1


def test_finalize_browser_diagnostics_empty():
    from website_profiling.crawl.fetchers.browser_diagnostics import finalize_browser_diagnostics

    diag = finalize_browser_diagnostics([], [], [])
    assert diag["summary"]["console_error_count"] == 0
    assert diag["summary"]["page_error_count"] == 0


def test_build_fetcher_static_mode():
    fetcher = build_fetcher(render_mode="static", timeout=5)
    try:
        assert isinstance(fetcher, StaticFetcher)
    finally:
        fetcher.close()


def test_validate_browser_available_raises_without_playwright(monkeypatch):
    import builtins

    monkeypatch.setenv("WP_SKIP_BROWSER_AUTO_INSTALL", "1")
    real_import = builtins.__import__

    def mock_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "playwright":
            raise ImportError("no playwright")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", mock_import)
    with pytest.raises(RuntimeError, match="JavaScript crawl requires"):
        validate_browser_available()


def test_needs_js_render_detects_next_shell():
    html = '<html><body><script id="__NEXT_DATA__">{}</script><div id="root"></div></body></html>'
    assert needs_js_render(_static_result(html)) is True


@pytest.mark.parametrize(
    "fixture_name",
    ["angular_shell.html", "svelte_shell.html", "vue_shell.html"],
)
def test_needs_js_render_detects_framework_shell(fixture_name):
    html = (FIXTURES / fixture_name).read_text(encoding="utf-8")
    assert needs_js_render(_static_result(html)) is True


def test_needs_js_render_after_parse_low_links_with_scripts():
    html = (FIXTURES / "post_parse_shell.html").read_text(encoding="utf-8")
    result = _static_result(html)
    assert needs_js_render(result) is False
    assert needs_js_render_after_parse(
        result, link_count=0, same_domain_link_count=0
    ) is True


def test_needs_js_render_after_parse_skips_rendered():
    html = (FIXTURES / "post_parse_shell.html").read_text(encoding="utf-8")
    result = _static_result(html, fetch_method="rendered")
    assert needs_js_render_after_parse(
        result, link_count=0, same_domain_link_count=0
    ) is False


def test_needs_js_render_after_parse_normal_page():
    links = "".join(
        f'<a href="https://example.com/page-{i}">p{i}</a>' for i in range(12)
    )
    html = f"<html><body><h1>Blog</h1><nav>{links}</nav></body></html>"
    result = _static_result(html)
    assert needs_js_render_after_parse(
        result, link_count=12, same_domain_link_count=12
    ) is False


def test_needs_js_render_after_parse_spa_with_many_same_domain_links():
    links = "".join(
        f'<a href="https://example.com/page-{i}">p{i}</a>' for i in range(12)
    )
    html = (
        f'<html><head></head><body><div id="root"></div>'
        f'<script src="/app.js"></script>{links}</body></html>'
    )
    result = _static_result(html)
    assert needs_js_render_after_parse(
        result, link_count=12, same_domain_link_count=12
    ) is True


def test_hybrid_refetch_rendered_uses_browser(monkeypatch):
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    rendered = _static_result("<html>rendered</html>", fetch_method="rendered")

    class FakeBrowser:
        def fetch(self, _url):
            return rendered

        def close(self):
            pass

    class FakeStatic:
        def fetch(self, _url):
            return _static_result("<html>static</html>")

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = hybrid.refetch_rendered("https://example.com/")
        assert out.fetch_method == "rendered"
        assert out.text == "<html>rendered</html>"
    finally:
        hybrid.close()


def test_hybrid_fetch_escalates_static_403_to_browser_success(monkeypatch):
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    class FakeStatic:
        def fetch(self, _url):
            return _static_result("<html>blocked</html>", status=403)

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            return _static_result("<html>real content</html>", fetch_method="rendered")

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = hybrid.fetch("https://example.com/")
        assert out.status == 200
        assert out.fetch_blocked is False
        assert out.text == "<html>real content</html>"
    finally:
        hybrid.close()


def test_hybrid_fetch_both_static_and_browser_blocked_marks_fetch_blocked(monkeypatch):
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    class FakeStatic:
        def fetch(self, _url):
            return _static_result("<html>static challenge</html>", status=403)

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            return _static_result(
                "<html>browser challenge</html>", fetch_method="rendered", status=403
            )

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = hybrid.fetch("https://example.com/")
        assert out.status == 403
        assert out.fetch_blocked is True
        assert out.text == "<html>browser challenge</html>"
    finally:
        hybrid.close()


def test_hybrid_fetch_429_retries_static_before_escalating(monkeypatch):
    from website_profiling.crawl.fetchers import hybrid as hybrid_module
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    monkeypatch.setattr(hybrid_module.time, "sleep", lambda _s: None)
    calls = {"static": 0, "browser": 0}

    class FakeStatic:
        def fetch(self, _url):
            calls["static"] += 1
            if calls["static"] == 1:
                return _static_result("<html>rate limited</html>", status=429)
            return _static_result("<html>recovered</html>", status=200)

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            calls["browser"] += 1
            return _static_result("<html>should not be used</html>", fetch_method="rendered")

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = hybrid.fetch("https://example.com/")
        assert calls["static"] == 2
        assert calls["browser"] == 0
        assert out.status == 200
        assert out.text == "<html>recovered</html>"
        assert out.fetch_blocked is False
    finally:
        hybrid.close()


def test_hybrid_fetch_429_respects_retry_after_header(monkeypatch):
    from website_profiling.crawl.fetchers import hybrid as hybrid_module
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    sleep_calls = []
    monkeypatch.setattr(hybrid_module.time, "sleep", lambda s: sleep_calls.append(s))

    class FakeStatic:
        def fetch(self, _url):
            return _static_result("<html>rate limited</html>", status=429, retry_after_header="3")

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            return _static_result("<html>rendered</html>", fetch_method="rendered")

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        hybrid.fetch("https://example.com/")
        assert sleep_calls == [3.0]
    finally:
        hybrid.close()


def test_hybrid_fetch_429_ignores_malformed_retry_after(monkeypatch):
    from website_profiling.crawl.fetchers import hybrid as hybrid_module
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    sleep_calls = []
    monkeypatch.setattr(hybrid_module.time, "sleep", lambda s: sleep_calls.append(s))

    class FakeStatic:
        def fetch(self, _url):
            return _static_result(
                "<html>rate limited</html>",
                status=429,
                retry_after_header="Wed, 21 Oct 2026 07:28:00 GMT",
            )

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            return _static_result("<html>rendered</html>", fetch_method="rendered")

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        hybrid.fetch("https://example.com/")
        assert sleep_calls == [1.0]  # falls back to the default, doesn't raise
    finally:
        hybrid.close()


def test_hybrid_fetch_429_retry_after_is_capped(monkeypatch):
    from website_profiling.crawl.fetchers import hybrid as hybrid_module
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    sleep_calls = []
    monkeypatch.setattr(hybrid_module.time, "sleep", lambda s: sleep_calls.append(s))

    class FakeStatic:
        def fetch(self, _url):
            return _static_result("<html>rate limited</html>", status=429, retry_after_header="9999")

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            return _static_result("<html>rendered</html>", fetch_method="rendered")

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        hybrid.fetch("https://example.com/")
        assert sleep_calls == [10.0]
    finally:
        hybrid.close()


def test_hybrid_fetch_blocked_static_falls_back_when_browser_crashes(monkeypatch):
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    class FakeStatic:
        def fetch(self, _url):
            return _static_result("<html>static challenge</html>", status=403)

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            return FetchResult(
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

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = hybrid.fetch("https://example.com/")
        # Browser crashed outright (not "blocked") — fall back to the real
        # static result rather than a crashed/empty one; not marked as
        # fetch_blocked since no confirmed browser verdict was reached.
        assert out.status == 403
        assert out.fetch_blocked is False
        assert out.text == "<html>static challenge</html>"
    finally:
        hybrid.close()


def test_hybrid_fetch_200_case_unaffected(monkeypatch):
    from website_profiling.crawl.fetchers.hybrid import HybridFetcher

    browser_calls = {"count": 0}

    class FakeStatic:
        def fetch(self, _url):
            return _static_result("<html><body><h1>Normal page</h1></body></html>")

        def close(self):
            pass

    class FakeBrowser:
        def fetch(self, _url):
            browser_calls["count"] += 1
            return _static_result("<html>rendered</html>", fetch_method="rendered")

        def close(self):
            pass

    hybrid = HybridFetcher(FakeStatic(), lambda: FakeBrowser())
    try:
        out = hybrid.fetch("https://example.com/")
        assert browser_calls["count"] == 0
        assert out.status == 200
        assert out.fetch_blocked is False
        assert out.text == "<html><body><h1>Normal page</h1></body></html>"
    finally:
        hybrid.close()


def test_browser_status_reports_missing_playwright(monkeypatch):
    import builtins

    real_import = builtins.__import__

    def mock_import(name, globals=None, locals=None, fromlist=(), level=0):
        if name == "playwright":
            raise ImportError("no playwright")
        return real_import(name, globals, locals, fromlist, level)

    monkeypatch.setattr(builtins, "__import__", mock_import)
    status = browser_status()
    assert status["ok"] is False
    assert "JavaScript crawl requires" in str(status.get("message", ""))


@pytest.mark.parametrize(
    "env_chrome_path,isfile_return,which_return",
    [
        ("/usr/bin/chromium", True, None),
        ("", False, "/usr/bin/chromium"),
    ],
)
def test_browser_status_ok_when_chromium_available(
    monkeypatch, env_chrome_path, isfile_return, which_return
):
    import sys
    import types

    monkeypatch.setitem(sys.modules, "playwright", types.ModuleType("playwright"))
    monkeypatch.setenv("CHROME_PATH", env_chrome_path)
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps.os.path.isfile",
        lambda path: isfile_return and path == env_chrome_path,
    )
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps.shutil.which",
        lambda _name: which_return,
    )
    status = browser_status()
    assert status["ok"] is True


def test_ensure_browser_deps_skips_install_when_disabled(monkeypatch):
    monkeypatch.setenv("WP_SKIP_BROWSER_AUTO_INSTALL", "1")
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps.browser_status",
        lambda: {"ok": False, "message": "missing"},
    )
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps._pip_install_browser_requirements",
        lambda: (_ for _ in ()).throw(AssertionError("should not pip install")),
    )
    status = ensure_browser_deps()
    assert status["ok"] is False


def test_repo_root_uses_website_profiling_root_env(monkeypatch, tmp_path):
    from website_profiling.crawl.fetchers import browser_deps

    monkeypatch.setenv("WEBSITE_PROFILING_ROOT", str(tmp_path))
    assert browser_deps._repo_root() == tmp_path


def test_repo_root_defaults_to_project_root(monkeypatch):
    from website_profiling.crawl.fetchers import browser_deps

    monkeypatch.delenv("WEBSITE_PROFILING_ROOT", raising=False)
    root = browser_deps._repo_root()
    assert (root / "requirements.txt").is_file()


def test_playwright_chromium_unavailable_without_playwright(monkeypatch):
    from website_profiling.crawl.fetchers import browser_deps

    monkeypatch.setattr(browser_deps, "_playwright_importable", lambda: False)
    assert browser_deps._playwright_chromium_available() is False


def test_chromium_available_via_playwright_executable(monkeypatch):
    import sys
    import types

    from website_profiling.crawl.fetchers import browser_deps

    class FakeChromium:
        executable_path = "/tmp/fake-chromium"

    class FakePlaywright:
        chromium = FakeChromium()

    class FakeContext:
        def __enter__(self):
            return FakePlaywright()

        def __exit__(self, *_args):
            return False

    sync_api = types.ModuleType("playwright.sync_api")
    sync_api.sync_playwright = lambda: FakeContext()
    playwright_mod = types.ModuleType("playwright")
    playwright_mod.sync_api = sync_api
    monkeypatch.setitem(sys.modules, "playwright", playwright_mod)
    monkeypatch.setitem(sys.modules, "playwright.sync_api", sync_api)

    monkeypatch.setattr(browser_deps, "_system_chromium_available", lambda: False)
    monkeypatch.setattr(browser_deps, "_playwright_importable", lambda: True)
    monkeypatch.setattr(
        browser_deps.os.path,
        "isfile",
        lambda path: path == "/tmp/fake-chromium",
    )
    assert browser_deps.chromium_available() is True


def test_playwright_chromium_available_returns_false_on_error(monkeypatch):
    from website_profiling.crawl.fetchers import browser_deps

    monkeypatch.setattr(browser_deps, "_playwright_importable", lambda: True)

    def boom():
        raise RuntimeError("playwright broken")

    import sys
    import types

    sync_api = types.ModuleType("playwright.sync_api")
    sync_api.sync_playwright = boom
    monkeypatch.setitem(sys.modules, "playwright", types.ModuleType("playwright"))
    monkeypatch.setitem(sys.modules, "playwright.sync_api", sync_api)
    assert browser_deps._playwright_chromium_available() is False


def test_browser_status_missing_chromium_with_playwright(monkeypatch):
    import sys
    import types

    monkeypatch.setitem(sys.modules, "playwright", types.ModuleType("playwright"))
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps.chromium_available",
        lambda: False,
    )
    status = browser_status()
    assert status["ok"] is False
    assert "JavaScript crawl requires" in str(status.get("message", ""))


def test_ensure_browser_deps_returns_ok_without_install(monkeypatch):
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps.browser_status",
        lambda: {"ok": True},
    )
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps._pip_install_browser_requirements",
        lambda: (_ for _ in ()).throw(AssertionError("should not pip install")),
    )
    status = ensure_browser_deps()
    assert status["ok"] is True


def test_pip_install_browser_requirements_runs_playwright_install(monkeypatch, tmp_path):
    from website_profiling.crawl.fetchers import browser_deps

    monkeypatch.setenv("WEBSITE_PROFILING_ROOT", str(tmp_path))
    called: list = []

    def fake_run(cmd, **kwargs):
        called.append(cmd)

    monkeypatch.setattr(browser_deps.subprocess, "run", fake_run)
    browser_deps._pip_install_browser_requirements()
    assert called and "playwright>=1.49.0" in called[0]


def test_ensure_browser_deps_reports_auto_install_failure(monkeypatch):
    import subprocess

    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps.browser_status",
        lambda: {"ok": False, "message": "missing"},
    )
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps._playwright_importable",
        lambda: False,
    )
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps._pip_install_browser_requirements",
        lambda: (_ for _ in ()).throw(subprocess.CalledProcessError(1, "pip")),
    )
    status = ensure_browser_deps(install=True)
    assert status["ok"] is False
    assert "Auto-install failed" in str(status.get("message", ""))


def test_build_fetcher_unknown_mode_falls_back_to_static():
    fetcher = build_fetcher(render_mode="unknown-mode", timeout=5)  # type: ignore[arg-type]
    try:
        assert isinstance(fetcher, StaticFetcher)
    finally:
        fetcher.close()


def test_browser_auth_from_session_maps_headers_and_credentials():
    import requests

    from website_profiling.crawl.fetchers.factory import _browser_auth_from_session

    session = requests.Session()
    session.headers.update({"User-Agent": "TestBot", "Cookie": "sid=abc", "X-Auth": "token"})
    session.auth = ("crawler", "secret")
    headers, credentials = _browser_auth_from_session(session)
    assert "User-Agent" not in headers
    assert headers["Cookie"] == "sid=abc"
    assert headers["X-Auth"] == "token"
    assert credentials == {"username": "crawler", "password": "secret"}


def test_ensure_browser_deps_installs_when_missing(monkeypatch):
    pip_called: list[str] = []
    pw_called: list[str] = []
    statuses = [{"ok": False, "message": "missing"}, {"ok": True}]

    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps.browser_status",
        lambda: statuses.pop(0) if statuses else {"ok": True},
    )
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps._playwright_importable",
        lambda: bool(pip_called),
    )
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps.chromium_available",
        lambda: bool(pw_called),
    )
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps._pip_install_browser_requirements",
        lambda: pip_called.append("pip"),
    )
    monkeypatch.setattr(
        "website_profiling.crawl.fetchers.browser_deps._playwright_install_chromium",
        lambda: pw_called.append("playwright"),
    )
    status = ensure_browser_deps()
    assert status["ok"] is True
    assert pip_called == ["pip"]
    assert pw_called == ["playwright"]


def test_parse_sitemap_xml_urlset():
    xml = """<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>https://example.com/a</loc></url>
      <url><loc>https://example.com/b</loc></url>
    </urlset>"""
    pages, nested = _parse_sitemap_xml(xml, "https://example.com/sitemap.xml")
    assert nested == []
    assert "https://example.com/a" in pages
    assert "https://example.com/b" in pages


def test_discover_sitemap_urls_from_local_robots(monkeypatch):
    class FakeResp:
        def __init__(self, status_code, text):
            self.status_code = status_code
            self.text = text

    class FakeSession:
        headers = {}

        def get(self, url, timeout=0):
            if url.endswith("/robots.txt"):
                return FakeResp(200, "Sitemap: https://example.com/sitemap.xml\n")
            if url.endswith("/sitemap.xml"):
                return FakeResp(
                    200,
                    """<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
                    <url><loc>https://example.com/page-1</loc></url></urlset>""",
                )
            return FakeResp(404, "")

        def close(self):
            pass

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.requests.Session",
        lambda: FakeSession(),
    )
    urls = discover_sitemap_urls("https://example.com")
    assert "https://example.com/page-1" in urls


@pytest.mark.browser
def test_browser_fetcher_discovers_js_link(spa_server):
    validate_browser_available()
    fetcher = build_fetcher(
        render_mode="javascript",
        js_timeout=15,
        js_extra_wait_ms=500,
        js_concurrency=1,
    )
    try:
        static = StaticFetcher(timeout=5)
        try:
            static_result = static.fetch(spa_server)
        finally:
            static.close()
        assert static_result.text is not None
        assert 'href="/discovered-by-js"' not in static_result.text

        rendered = fetcher.fetch(spa_server)
        assert rendered.status == 200
        assert rendered.text is not None
        assert 'href="/discovered-by-js"' in rendered.text
        assert rendered.fetch_method == "rendered"
    finally:
        fetcher.close()


@pytest.mark.browser
def test_browser_fetcher_captures_console_errors(spa_server):
    validate_browser_available()
    base = spa_server.rsplit("/", 1)[0]
    url = f"{base}/console_error.html"
    fetcher = build_fetcher(
        render_mode="javascript",
        js_timeout=15,
        js_extra_wait_ms=800,
        js_concurrency=1,
        capture_console=True,
        js_console_levels="error,warning",
    )
    try:
        rendered = fetcher.fetch(url)
        assert rendered.status == 200
        assert rendered.browser_diagnostics is not None
        summary = rendered.browser_diagnostics.get("summary") or {}
        assert summary.get("console_error_count", 0) >= 1
        assert summary.get("page_error_count", 0) >= 1
        console = rendered.browser_diagnostics.get("console") or []
        assert any("fixture console error" in str(c.get("text", "")).lower() for c in console)
    finally:
        fetcher.close()


@pytest.mark.browser
def test_auto_fetcher_falls_back_for_spa_shell(spa_server):
    validate_browser_available()
    fetcher = build_fetcher(
        render_mode="auto",
        js_timeout=15,
        js_extra_wait_ms=500,
        js_concurrency=1,
    )
    try:
        result = fetcher.fetch(spa_server)
        assert result.status == 200
        assert result.text is not None
        assert "/discovered-by-js" in result.text
        assert result.fetch_method == "rendered"
    finally:
        fetcher.close()
