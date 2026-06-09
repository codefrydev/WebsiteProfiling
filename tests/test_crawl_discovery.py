"""Tests for crawl discovery modes."""
from __future__ import annotations

import json

import website_profiling.crawl.crawler as mod
from website_profiling.crawl.discovery import (
    follow_links_for_mode,
    normalize_discovery_mode,
    parse_crawl_url_list,
    seed_sitemap_for_mode,
)
from website_profiling.crawl.fetchers.base import FetchResult


def test_normalize_discovery_mode_defaults_spider():
    assert normalize_discovery_mode(None) == "spider"
    assert normalize_discovery_mode("invalid") == "spider"
    assert normalize_discovery_mode("LIST") == "list"


def test_parse_crawl_url_list_dedupes():
    raw = "https://a.com/1\nhttps://a.com/1,https://a.com/2"
    assert parse_crawl_url_list(raw) == ["https://a.com/1", "https://a.com/2"]


def test_mode_flags():
    assert follow_links_for_mode("list") is False
    assert follow_links_for_mode("sitemap") is False
    assert follow_links_for_mode("spider") is True
    assert seed_sitemap_for_mode("list") is False
    assert seed_sitemap_for_mode("sitemap") is True


def test_list_mode_does_not_follow_links(monkeypatch):
    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        store_outlinks=True,
        discovery_mode="list",
        crawl_url_list=["https://site.com/a", "https://site.com/b"],
    )
    assert c.follow_links is False
    assert set(c.depths.keys()) == {"https://site.com/a", "https://site.com/b"}

    c.fetch = lambda url: FetchResult(  # type: ignore[method-assign]
        status=200,
        content_type="text/html",
        text='<html><a href="https://site.com/c">c</a></html>',
        response_time_ms=1,
        content_length=10,
        final_url=url,
        headers_dict={},
        redirect_chain_length=0,
        fetch_method="static",
    )
    out = c.worker("https://site.com/a")
    assert out["status"] == 200
    assert "https://site.com/c" not in c.depths


def test_parse_link_edges_rel_flags():
    from website_profiling.common import parse_link_edges

    html = """
    <html><body>
      <a href="/a" rel="nofollow sponsored">A</a>
      <a href="/b">B</a>
    </body></html>
    """
    _title, edges = parse_link_edges("https://site.com/page", html)
    by_href = {e["to_url"].split("/")[-1]: e for e in edges}
    assert by_href["a"]["is_nofollow"] is True
    assert by_href["a"]["is_sponsored"] is True
    assert by_href["b"]["is_nofollow"] is False
