from __future__ import annotations

import json
import types

import pandas as pd


def test_worker_success_path_populates_many_fields(monkeypatch):
    import website_profiling.crawl.crawler as mod
    from website_profiling.crawl.fetchers.base import FetchResult

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(
        start_url="https://site.com",
        ignore_robots=True,
        allow_external=False,
        use_wappalyzer=False,
        store_outlinks=True,
        max_depth=2,
    )
    c.fetch = lambda _url: FetchResult(  # type: ignore[method-assign]
        status=200,
        content_type="text/html",
        text="<html><body>ok</body></html>",
        response_time_ms=12,
        content_length=100,
        final_url="https://site.com/page",
        headers_dict={"X-Robots-Tag": ""},
        redirect_chain_length=0,
        fetch_method="static",
    )
    monkeypatch.setattr(mod, "parse_links", lambda _u, _t: ("T", {"https://site.com/a", "https://ext.com/x"}))
    monkeypatch.setattr(mod, "parse_seo", lambda *_a, **_k: ("desc", 4, "h1", 1, "https://site.com/canon"))
    monkeypatch.setattr(
        mod,
        "parse_seo_extended",
        lambda *_a, **_k: {
            "viewport_present": True,
            "viewport_content": "w",
            "noindex": False,
            "has_schema": True,
            "heading_sequence": ["h1"],
            "images_without_alt": 0,
            "images_total": 1,
            "img_without_lazy": 0,
            "img_without_dimensions": 0,
            "aria_count": 0,
            "mixed_content_count": 0,
        },
    )
    monkeypatch.setattr(mod, "parse_resources", lambda *_a, **_k: {"script_count": 1, "link_stylesheet_count": 1})
    monkeypatch.setattr(
        mod,
        "parse_content_text",
        lambda *_a, **_k: {
            "word_count": 10,
            "reading_level": 4.2,
            "content_html_ratio": 30.0,
            "top_keywords": "[]",
            "content_excerpt": "abc",
        },
    )
    monkeypatch.setattr(
        mod,
        "parse_social_meta",
        lambda *_a, **_k: {
            "og_title": "og",
            "og_description": "",
            "og_image": "",
            "og_type": "",
            "twitter_card": "",
            "twitter_title": "",
            "twitter_image": "",
        },
    )
    monkeypatch.setattr(mod, "parse_tech_stack", lambda *_a, **_k: "[]")
    monkeypatch.setattr(mod, "analyze_html", lambda *_a, **_k: {"ok": True})

    out = c.worker("https://site.com")
    assert out["status"] == 200
    assert out["title"] == "T"
    assert out["meta_description"] == "desc"
    assert out["word_count"] == 10
    assert "outlink_targets" in out
    assert "https://site.com/a" in json.loads(out["outlink_targets"])


def test_crawl_runs_and_handles_done_futures(monkeypatch):
    import website_profiling.crawl.crawler as mod

    monkeypatch.setattr(
        "website_profiling.crawl.sitemap.discover_sitemap_urls",
        lambda *_a, **_k: [],
    )
    c = mod.Crawler(start_url="https://site.com", ignore_robots=True, use_wappalyzer=False, concurrency=1, max_pages=1)
    monkeypatch.setattr(
        c,
        "worker",
        lambda url: {"url": url, "status": 200, "content_type": "text/html", "title": "ok", "outlinks": 0},
    )
    df = c.crawl(show_progress=False)
    assert not df.empty
    assert "crawl_time_s" in df.columns


def test_run_crawler_writes_csv(monkeypatch, tmp_path):
    import website_profiling.crawl.crawler as mod

    class FakeCrawler:
        def __init__(self, **_kwargs):
            pass

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200}])

    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    out_file = tmp_path / "out.csv"
    df = mod.run_crawler("https://a.com", output_db=False, output_csv=str(out_file), show_progress=False)
    assert not df.empty
    assert out_file.exists()


def test_run_crawler_streaming_db_path(monkeypatch):
    import website_profiling.crawl.crawler as mod

    class FakeCrawler:
        def __init__(self, **_kwargs):
            pass

        def crawl(self, **_kwargs):
            return pd.DataFrame([{"url": "https://a.com", "status": 200}])

    class _Ctx:
        def __enter__(self):
            return object()

        def __exit__(self, _t, _v, _tb):
            return False

    monkeypatch.setattr(mod, "Crawler", FakeCrawler)
    fake_db = types.SimpleNamespace(
        backup_db_if_exists=lambda: None,
        create_crawl_run=lambda _c, _u, property_id=None, render_mode=None: 10,
        db_session=lambda: _Ctx(),
        read_historical_data=lambda: {},
        restore_historical_data=lambda *_a, **_k: None,
    )
    fake_storage = types.SimpleNamespace(ensure_crawl_tables_cleared=lambda *_a, **_k: None)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db", fake_db)
    monkeypatch.setitem(__import__("sys").modules, "website_profiling.db.storage", fake_storage)

    df = mod.run_crawler("https://a.com", output_db=True, crawl_stream_to_db=True, show_progress=False)
    assert not df.empty

