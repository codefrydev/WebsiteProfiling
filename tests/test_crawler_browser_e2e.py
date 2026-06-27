from __future__ import annotations

import json

import pytest

from website_profiling.crawl.crawler import run_crawler
from website_profiling.crawl.fetchers.factory import validate_browser_available


def _urls_from_df(df) -> set[str]:
    urls: set[str] = set()
    if "url" in df.columns:
        urls.update(str(u) for u in df["url"].dropna())
    if "outlink_targets" in df.columns:
        for raw in df["outlink_targets"].fillna(""):
            try:
                for link in json.loads(raw or "[]"):
                    urls.add(str(link))
            except (json.JSONDecodeError, TypeError):
                continue
    return urls


@pytest.mark.browser
def test_run_crawler_auto_discovers_js_links(spa_server):
    validate_browser_available()
    base = spa_server.rsplit("/", 1)[0]
    start_url = f"{base}/post_parse_shell.html"
    df, _ = run_crawler(
        start_url=start_url,
        render_mode="auto",
        max_pages=10,
        ignore_robots=True,
        show_progress=False,
        output_csv=None,
        output_db=False,
        js_timeout=15,
        js_extra_wait_ms=500,
        js_concurrency=1,
        concurrency=2,
    )
    assert not df.empty
    all_urls = _urls_from_df(df)
    assert any("discovered-by-js" in u for u in all_urls)
    if "fetch_method" in df.columns:
        assert (df["fetch_method"] == "rendered").any()
