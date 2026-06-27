"""Coverage for reporting modules split from builder.py (reporting gate)."""
from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pandas as pd
import pytest

from website_profiling.reporting import content_analytics, edges_report, lighthouse_report, report_metadata, seo_summary, site_level


def _crawl_df() -> pd.DataFrame:
    return pd.DataFrame(
        [
            {
                "url": "https://example.com/",
                "status": "200",
                "title": "A" * 45,
                "meta_description_len": 100,
                "meta_description": "desc",
                "h1_count": 1,
                "h1": "Heading",
                "content_length": 500,
                "word_count": 250,
                "reading_level": 10,
                "content_html_ratio": 25,
                "outlinks": 3,
                "depth": 0,
                "response_time_ms": 2500,
                "content_type": "text/html",
                "og_title": "OG",
                "twitter_card": "summary",
                "og_image": "https://cdn.example.com/img.png",
                "tech_stack": json.dumps(["WordPress", "nginx"]),
                "top_keywords": json.dumps([{"word": "seo audit", "count": 4}]),
                "heading_sequence": "h1,h2",
                "script_count": 2,
                "link_stylesheet_count": 1,
                "page_analysis": json.dumps(
                    {
                        "html_lang": "en",
                        "hreflang_alternates": [{"hreflang": "en", "href": "https://example.com/"}],
                        "external_links": ["https://partner.com/page"],
                    }
                ),
                "outlink_targets": "https://example.com/about,https://partner.com/x",
                "fetch_method": "static",
            },
            {
                "url": "https://example.com/about",
                "status": "200",
                "title": "Short",
                "meta_description_len": 50,
                "h1_count": 0,
                "content_length": 150,
                "word_count": 80,
                "depth": 1,
                "response_time_ms": 150,
                "content_type": "text/html",
                "og_title": "",
                "twitter_card": "",
                "og_image": "",
                "tech_stack": "[]",
                "top_keywords": "not-json",
                "script_count": 0,
                "link_stylesheet_count": 0,
                "fetch_method": "rendered",
            },
            {
                "url": "https://example.com/missing",
                "status": "404",
                "title": "",
                "meta_description": "",
                "h1": "",
                "heading_sequence": "",
                "word_count": 0,
                "content_length": 0,
                "h1_count": 0,
                "script_count": 0,
                "link_stylesheet_count": 0,
            },
            {
                "url": "https://example.com/redirect",
                "status": "301",
                "final_url": "https://example.com/dest",
                "title": "T" * 70,
                "meta_description": "",
                "h1": "",
                "heading_sequence": "",
                "word_count": 0,
                "meta_description_len": 200,
                "h1_count": 3,
                "content_length": 50,
                "script_count": 0,
                "link_stylesheet_count": 0,
            },
            {
                "url": "https://example.com/error",
                "status": "error",
                "title": "",
                "meta_description": "",
                "h1": "",
                "heading_sequence": "",
                "word_count": 0,
                "content_length": 0,
                "h1_count": 0,
                "script_count": 0,
                "link_stylesheet_count": 0,
            },
        ]
    )


def test_compute_summary_seo_issues() -> None:
    out = seo_summary._compute_summary_seo_issues(_crawl_df())
    assert out["summary"]["total_urls"] == 5
    assert out["issues"]["broken"]
    assert out["issues"]["redirects"]
    assert out["issues"]["seo"]
    assert out["recommendations"]


def test_status_text_normalization() -> None:
    assert seo_summary._status_text(400) == "400"
    assert seo_summary._status_text(400.0) == "400"
    assert seo_summary._status_text("301") == "301"
    assert seo_summary._status_text("error") == "error"
    assert seo_summary._status_text(None) == ""
    assert seo_summary._status_text(float("nan")) == ""


def test_compute_summary_classifies_numeric_and_float_statuses() -> None:
    df = pd.DataFrame(
        [
            {"url": "https://example.com/ok", "status": 200.0},
            {"url": "https://example.com/redir", "status": 301, "final_url": "https://example.com/dest"},
            {"url": "https://example.com/bad", "status": 400.0},
            {"url": "https://example.com/boom", "status": 500},
        ]
    )
    out = seo_summary._compute_summary_seo_issues(df)
    summary = out["summary"]
    assert summary["count_2xx"] == 1
    assert summary["count_3xx"] == 1
    assert summary["count_4xx"] == 1
    assert summary["count_5xx"] == 1

    broken = {b["url"] for b in out["issues"]["broken"]}
    assert {"https://example.com/bad", "https://example.com/boom"} <= broken

    redirects = {r["url"]: r for r in out["issues"]["redirects"]}
    assert "https://example.com/redir" in redirects
    assert redirects["https://example.com/redir"]["status"] == "301"
    assert redirects["https://example.com/redir"]["final_url"] == "https://example.com/dest"


def test_content_analytics_helpers() -> None:
    df = _crawl_df()
    content = content_analytics._build_content_analytics(df)
    assert content["word_count_stats"]["mean"] > 0
    assert content["thin_pages"]
    assert content_analytics._parse_top_keywords_items(None) == []
    assert content_analytics._parse_top_keywords_items('["list"]') == []
    assert content_analytics._parse_top_keywords_items(json.dumps([{"word": "x", "count": 2}]))[0]["word"] == "x"

    social = content_analytics._build_social_coverage(df)
    assert social["og_coverage_pct"] > 0
    assert social["missing_og"]

    tech = content_analytics._build_tech_stack_summary(df)
    assert tech["technologies"]

    rt = content_analytics._build_response_time_stats(df)
    assert rt["slow_pages"]
    assert rt["p50"] > 0

    depth = content_analytics._build_depth_distribution(df)
    assert depth["max_depth"] == 1

    kw = content_analytics._build_keyword_opportunities(df, {"include_keyword_opportunities": "true"})
    assert "quick_wins" in kw
    assert content_analytics._build_keyword_opportunities(df, {"include_keyword_opportunities": "false"}) == {}


def test_build_image_inventory_empty_urls(capsys) -> None:
    with patch("website_profiling.analysis.image_probe.probe_image_urls") as probe:
        inventory, summary = content_analytics._build_image_inventory(
            [{"url": "https://ex.com/", "page_analysis": {}}],
            {"probe_image_inventory": "true"},
        )
    probe.assert_not_called()
    assert inventory == []
    assert summary["inventory_available"] is False


def test_build_image_inventory_counts_failures(capsys) -> None:
    links = [{"url": "https://ex.com/p", "page_analysis": {"image_urls": ["https://cdn.ex.com/a.png"]}}]
    probed = [{"url": "https://cdn.ex.com/a.png", "status": None, "content_type": None, "size_bytes": None, "error": "timeout"}]
    with patch("website_profiling.analysis.image_probe.probe_image_urls", return_value=probed):
        inventory, summary = content_analytics._build_image_inventory(
            links,
            {"probe_image_inventory": "true", "max_image_probe_urls": "10"},
        )
    assert summary["failed"] == 1
    assert summary["inventory_available"] is True
    assert inventory[0]["error"] == "timeout"


def test_report_metadata_helpers(capsys) -> None:
    df = _crawl_df()
    assert report_metadata._parse_page_analysis_cell(float("nan")) == {}
    assert report_metadata._parse_page_analysis_cell("{bad") == {}

    outbound = report_metadata._build_outbound_link_domains(df, "https://example.com/", 10)
    assert outbound[0]["host"] == "partner.com"

    fps = report_metadata._build_url_fingerprints(df)
    assert fps[0]["content_fingerprint"]

    hreflang = report_metadata._build_hreflang_summary(df)
    assert hreflang["pages_with_hreflang_links"] == 1

    payload = {"links": [{}], "summary": {"total_urls": 2}, "report_meta": {"crawl_scope": {"pages_crawled": 3}}}
    report_metadata._validate_report_url_counts(payload, 1)
    assert payload["ml_errors"]

    meta = report_metadata._build_report_metadata(
        df,
        {"max_pages": "2", "export_logo_url": "https://logo.example/logo.png", "crawl_render_mode": "static"},
        {"url": "https://example.com/"},
        {
            "fetched_at": "2026-01-01",
            "date_range_days": 28,
            "gsc": {"row_count": 10},
            "ga4": {"sessions": 1},
        },
        {"rows": [{"word": "test", "source": "crawl"}], "enriched_at": "2026-01-02"},
        {"llm_meta": {"model": "gpt-test"}},
        42,
        "2026-01-01T00:00:00Z",
        {
            "imported_at": "2026-01-03",
            "top_linking_sites": ["a.com"],
            "sample_links": [{"url": "x"}],
            "latest_links": [],
        },
    )
    assert "lighthouse" in meta["data_sources"]
    assert "search_console" in meta["data_sources"]
    assert "analytics" in meta["data_sources"]
    assert "ai" in meta["data_sources"]
    assert "estimated" in meta["data_sources"]
    assert meta["export_logo_url"] == "https://logo.example/logo.png"
    assert meta["crawl_run_id"] == 42


def test_site_level_branches(monkeypatch) -> None:
    assert site_level._fetch_site_level("not-a-url")["robots_present"] is False

    session = MagicMock()
    session.get.side_effect = RuntimeError("network")
    monkeypatch.setattr("website_profiling.reporting.site_level.requests.Session", lambda: session)
    out = site_level._fetch_site_level("https://example.com/", timeout=1)
    assert out["robots_present"] is False
    assert out["sitemap_present"] is False


def test_lighthouse_report_helpers() -> None:
    assert lighthouse_report._strip_www("WWW.Example.COM") == "example.com"
    assert lighthouse_report._url_hostname("") == ""
    assert lighthouse_report._url_hostname("not a url") == ""
    assert lighthouse_report._hosts_match("www.example.com", "example.com")
    assert not lighthouse_report._hosts_match("", "example.com")

    by_url = {"https://example.com/": {"score": 90}, "https://other.com/": {"score": 50}}
    filtered = lighthouse_report.filter_lighthouse_by_host(by_url, "example.com")
    assert len(filtered) == 1

    assert lighthouse_report.lighthouse_for_url(by_url, "https://example.com")["score"] == 90
    assert lighthouse_report.lighthouse_for_url(by_url, "https://missing.com") is None

    host = lighthouse_report._derive_expected_host("", pd.DataFrame({"url": ["https://derived.com/x"]}))
    assert host == "derived.com"

    picked = lighthouse_report._pick_lighthouse_summary(
        by_url,
        "https://example.com/",
        {"url": "https://example.com/", "performance": 88},
        "example.com",
    )
    assert picked is not None

    with patch("website_profiling.reporting.lighthouse_report.ssl.create_default_context") as ctx_mock:
        cert_sock = MagicMock()
        cert_sock.getpeercert.return_value = {"notAfter": "Jan  1 00:00:00 2030 GMT"}
        ctx_mock.return_value.wrap_socket.return_value.__enter__.return_value = cert_sock
        with patch("website_profiling.reporting.lighthouse_report.socket.create_connection"):
            iso = lighthouse_report.fetch_site_ssl_expires_iso("example.com")
    assert iso is not None
    assert lighthouse_report.fetch_site_ssl_expires_iso("") is None
    with patch("website_profiling.reporting.lighthouse_report.socket.create_connection", side_effect=OSError("fail")):
        assert lighthouse_report.fetch_site_ssl_expires_iso("example.com") is None


def test_build_lighthouse_by_url_for_report(monkeypatch) -> None:
    conn = MagicMock()
    raw = {
        "lighthouseResult": {
            "finalUrl": "https://example.com/",
            "audits": {
                "first-contentful-paint": {
                    "score": 0.5,
                    "title": "FCP",
                    "helpText": "Improve FCP",
                }
            },
        }
    }

    monkeypatch.setattr(
        "website_profiling.db.read_lighthouse_page_summaries",
        lambda _c: {"https://example.com": {"url": "https://example.com/", "median_metrics": {}}},
    )
    monkeypatch.setattr(
        "website_profiling.db.read_lh_runs_by_url",
        lambda _c: {"https://example.com": [99]},
    )
    monkeypatch.setattr("website_profiling.db.read_lighthouse_run_json", lambda _c, _id: raw)
    monkeypatch.setattr(
        "website_profiling.db.read_lh_audits_with_items",
        lambda _c, _id: [{"id": "fcp"}],
    )
    monkeypatch.setattr(
        "website_profiling.lighthouse.runner.extract_from_lighthouse_json",
        lambda _raw: {"performance_score": 50, "category_scores": {"performance": 50}},
    )
    monkeypatch.setattr(
        "website_profiling.tools.warnings.parse_lighthouse_to_diagnostics",
        lambda _raw, max_nodes_in_refs=None: [{"id": "diag"}],
    )
    monkeypatch.setattr(
        "website_profiling.tools.warnings.resolve_impact",
        lambda *_a, **_k: "high",
    )
    monkeypatch.setattr(
        "website_profiling.lighthouse.runner._evidence_from_audit",
        lambda _a: "evidence",
    )

    out = lighthouse_report.build_lighthouse_by_url_for_report(conn)
    assert "https://example.com" in out
    assert out["https://example.com"]["top_failures"]


def test_build_edges_from_df_paths(monkeypatch, tmp_path) -> None:
    edges_csv = str(tmp_path / "edges.csv")
    with patch("website_profiling.reporting.edges_report.load_edges", return_value=[("https://a.com", "https://a.com/b")]):
        loaded = edges_report.build_edges_from_df(
            pd.DataFrame({"url": ["https://a.com"]}),
            edges_csv,
            True,
            10,
            2,
            5,
            0.0,
        )
    assert loaded == [("https://a.com", "https://a.com/b")]

    df = pd.DataFrame(
        {
            "url": ["https://example.com/", "https://other.com/"],
            "outlink_targets": ["https://example.com/about", "https://other.com/x"],
        }
    )
    from_column = edges_report.build_edges_from_df(df, "", False, 10, 2, 5, 0.0)
    assert ("https://example.com/", "https://example.com/about") in from_column

    html = '<html><body><a href="/about">About</a><a href="https://external.com/x">Ext</a></body></html>'

    class FakeResp:
        status_code = 200
        text = html

        @property
        def headers(self):
            return {"Content-Type": "text/html"}

    session = MagicMock()
    session.get.return_value = FakeResp()
    monkeypatch.setattr("website_profiling.reporting.edges_report.requests.Session", lambda: session)

    fetched = edges_report.build_edges_from_df(
        pd.DataFrame({"url": ["https://example.com/"]}),
        "",
        True,
        10,
        1,
        5,
        0.0,
    )
    assert any(t == "https://example.com/about" for _s, t in fetched)

    fetcher = MagicMock()
    fetcher.fetch.return_value = SimpleNamespace(status=200, text=html)
    fetcher.close = MagicMock()
    monkeypatch.setattr("website_profiling.crawl.fetchers.build_fetcher", lambda **_k: fetcher)
    js_edges = edges_report.build_edges_from_df(
        pd.DataFrame({"url": ["https://example.com/"]}),
        "",
        True,
        10,
        1,
        5,
        0.0,
        render_mode="javascript",
    )
    fetcher.close.assert_called_once()
    assert js_edges

    fetcher_close_fail = MagicMock()
    fetcher_close_fail.fetch.return_value = SimpleNamespace(status=200, text=html)
    fetcher_close_fail.close.side_effect = RuntimeError("close failed")
    monkeypatch.setattr("website_profiling.crawl.fetchers.build_fetcher", lambda **_k: fetcher_close_fail)
    assert edges_report.build_edges_from_df(
        pd.DataFrame({"url": ["https://example.com/"]}),
        "",
        True,
        10,
        1,
        5,
        0.0,
        render_mode="javascript",
    )

    monkeypatch.setattr("website_profiling.crawl.fetchers.build_fetcher", lambda **_k: fetcher)
    fetcher.fetch.return_value = SimpleNamespace(status=404, text="")
    assert edges_report.build_edges_from_df(
        pd.DataFrame({"url": ["https://example.com/"]}),
        "",
        True,
        10,
        1,
        5,
        0.0,
        render_mode="auto",
    ) == []

    session.get.side_effect = RuntimeError("boom")
    assert edges_report.build_edges_from_df(
        pd.DataFrame({"url": ["https://example.com/"]}),
        "",
        True,
        10,
        1,
        5,
        0.0,
    ) == []


def test_content_analytics_edge_branches() -> None:
    assert content_analytics._build_content_analytics(pd.DataFrame())["word_count_stats"]["mean"] == 0
    assert content_analytics._build_content_analytics(pd.DataFrame({"url": ["x"], "status": ["404"]}))["word_count_stats"]["mean"] == 0

    df = pd.DataFrame(
        [
            {"url": float("nan"), "status": "200", "word_count": 100},
            {"url": "https://example.com/thin", "status": "200", "word_count": 50},
        ]
    )
    assert content_analytics._build_content_analytics(df)["thin_pages"] == [{"url": "https://example.com/thin", "word_count": 50}]

    assert content_analytics._parse_top_keywords_items(json.dumps(["bad"])) == []
    assert content_analytics._parse_top_keywords_items(json.dumps([{"word": "", "count": 1}])) == []

    hist_df = pd.DataFrame(
        [
            {
                "url": f"https://example.com/{i}",
                "status": "200",
                "top_keywords": json.dumps([{"word": "shared-term", "count": 1}]),
            }
            for i in range(25)
        ]
    )
    hist = content_analytics._build_text_content_analysis(hist_df)["keyword_frequency_histogram"]
    assert hist["21+"] == 1

    assert content_analytics._build_content_analytics(pd.DataFrame({"url": ["x"], "status": ["404"], "word_count": [0]}))["word_count_stats"]["mean"] == 0

    assert content_analytics._build_social_coverage(pd.DataFrame())["og_coverage_pct"] == 0
    non_html = pd.DataFrame([{"url": "https://example.com/x", "status": "200", "content_type": "application/json", "og_title": "x"}])
    assert content_analytics._build_social_coverage(non_html)["og_coverage_pct"] == 0

    social_df = pd.DataFrame(
        [
            {"url": float("nan"), "status": "200", "content_type": "text/html", "og_title": "x", "twitter_card": "x", "og_image": "x"},
            {"url": "https://example.com/a", "status": "200", "content_type": "text/html", "og_title": "", "twitter_card": "", "og_image": ""},
        ]
    )
    social = content_analytics._build_social_coverage(social_df)
    assert social["missing_og"] == ["https://example.com/a"]

    assert content_analytics._build_tech_stack_summary(pd.DataFrame({"url": ["x"], "status": ["200"]}))["technologies"] == []
    tech_df = pd.DataFrame(
        [
            {"url": "https://example.com/a", "status": "200", "content_type": "application/json", "tech_stack": '["React"]'},
            {"url": "https://example.com/b", "status": "200", "content_type": "text/html", "tech_stack": "bad-json"},
        ]
    )
    assert content_analytics._build_tech_stack_summary(tech_df)["technologies"] == []

    assert content_analytics._build_response_time_stats(pd.DataFrame({"url": ["x"]}))["p50"] == 0
    assert content_analytics._build_response_time_stats(pd.DataFrame({"url": ["x"], "response_time_ms": [None]}))["p50"] == 0
    assert content_analytics._build_depth_distribution(pd.DataFrame({"url": ["x"]}))["max_depth"] == 0
    assert content_analytics._build_depth_distribution(pd.DataFrame({"url": ["x"], "depth": [None]}))["max_depth"] == 0

    empty_kw = content_analytics._build_keyword_opportunities(
        pd.DataFrame({"url": ["https://example.com"], "status": ["404"]}),
        {"include_keyword_opportunities": "true"},
    )
    assert empty_kw["quick_wins"] == []


def test_report_metadata_extra_branches() -> None:
    assert report_metadata._parse_page_analysis_cell("{}") == {}
    df = pd.DataFrame(
        [
            {
                "url": "",
                "status": "200",
                "page_analysis": json.dumps({"external_links": ["https://partner.com/x", 123]}),
                "outlink_targets": "https://example.com/,https://partner.com/y",
            },
            {
                "url": "https://example.com/ok",
                "status": "200",
                "page_analysis": json.dumps({"external_links": ["https://partner.com/z"]}),
            },
        ]
    )
    hosts = report_metadata._build_outbound_link_domains(df, "https://example.com/", 10)
    assert any(h["host"] == "partner.com" for h in hosts)

    hreflang = report_metadata._build_hreflang_summary(
        pd.DataFrame(
            [
                {"url": "https://example.com/a", "status": "200", "page_analysis": json.dumps({"html_lang": "", "hreflang_alternates": []})},
                {"url": "https://example.com/b", "status": "404", "page_analysis": "{}"},
            ]
        )
    )
    assert hreflang["pages_missing_html_lang"] == 1

    meta = report_metadata._build_report_metadata(
        pd.DataFrame([{"url": "https://example.com", "status": "200"}]),
        {},
        None,
        {"gsc": {"row_count": 1}},
        None,
        {},
        None,
        None,
        {"imported_at": "2026-01-01", "top_linking_sites": [], "sample_links": [], "latest_links": []},
    )
    assert meta["gsc_links_imported_at"] == "2026-01-01"


def test_seo_summary_skips_blank_urls() -> None:
    df = pd.DataFrame(
        [
            {"url": float("nan"), "status": "200", "title": "Missing URL row"},
            {"url": "https://example.com/a", "status": "200", "title": "", "meta_description_len": 10, "h1_count": 0, "content_length": 100},
        ]
    )
    out = seo_summary._compute_summary_seo_issues(df)
    assert out["issues"]["seo"]


def test_site_level_reads_robots_sitemap_hint(monkeypatch) -> None:
    class FakeResp:
        def __init__(self, code, text):
            self.status_code = code
            self.text = text

    session = MagicMock()
    session.get.side_effect = lambda url, timeout=8: {
        "https://example.com/robots.txt": FakeResp(200, "User-agent: *\nSitemap: https://example.com/sitemap.xml"),
        "https://example.com/sitemap.xml": FakeResp(200, "<urlset></urlset>"),
        "https://example.com/ads.txt": FakeResp(404, ""),
        "https://example.com/.well-known/security.txt": FakeResp(404, ""),
    }[url]
    monkeypatch.setattr("website_profiling.reporting.site_level.requests.Session", lambda: session)
    out = site_level._fetch_site_level("https://example.com/", timeout=1)
    assert out["robots_present"] is True


def test_lighthouse_report_extra_branches(monkeypatch) -> None:
    assert lighthouse_report.filter_lighthouse_by_host({}, "example.com") == {}
    assert lighthouse_report._derive_expected_host("", pd.DataFrame()) == ""

    cert_sock = MagicMock()
    cert_sock.getpeercert.return_value = {}
    ctx = MagicMock()
    ctx.wrap_socket.return_value.__enter__.return_value = cert_sock
    with patch("website_profiling.reporting.lighthouse_report.ssl.create_default_context", return_value=ctx), patch(
        "website_profiling.reporting.lighthouse_report.socket.create_connection"
    ):
        assert lighthouse_report.fetch_site_ssl_expires_iso("example.com") is None

    with patch("website_profiling.reporting.lighthouse_report.urlparse", side_effect=ValueError("bad")):
        assert lighthouse_report._url_hostname("bad://") == ""

    picked = lighthouse_report._pick_lighthouse_summary(
        {},
        "",
        {"url": "https://other.com/", "performance": 1},
        "example.com",
    )
    assert picked is None

    assert lighthouse_report.lighthouse_for_url({}, "https://example.com") is None

    conn = MagicMock()
    monkeypatch.setattr("website_profiling.db.read_lighthouse_page_summaries", lambda _c: {})
    monkeypatch.setattr("website_profiling.db.read_lh_runs_by_url", lambda _c: {})
    assert lighthouse_report.build_lighthouse_by_url_for_report(conn) == {}

    raw_only = {
        "lighthouseResult": {
            "finalUrl": "https://only-raw.com/",
            "audits": {"ok-audit": {"score": 1}, "bad": "text", "fail-audit": {"score": 0.2, "title": "Fail", "helpText": ""}},
        }
    }
    monkeypatch.setattr("website_profiling.db.read_lighthouse_page_summaries", lambda _c: {})
    monkeypatch.setattr("website_profiling.db.read_lh_runs_by_url", lambda _c: {"https://only-raw.com": [2]})
    monkeypatch.setattr("website_profiling.db.read_lighthouse_run_json", lambda _c, _id: raw_only)
    monkeypatch.setattr("website_profiling.db.read_lh_audits_with_items", lambda _c, _id: [])
    monkeypatch.setattr(
        "website_profiling.lighthouse.runner.extract_from_lighthouse_json",
        lambda _raw: {"performance_score": 40, "category_scores": {}, "lcp_ms": 1},
    )
    monkeypatch.setattr(
        "website_profiling.tools.warnings.parse_lighthouse_to_diagnostics",
        lambda _raw, max_nodes_in_refs=None: [],
    )
    monkeypatch.setattr("website_profiling.tools.warnings.resolve_impact", lambda *_a, **_k: "medium")
    monkeypatch.setattr("website_profiling.lighthouse.runner._evidence_from_audit", lambda _a: "")
    out = lighthouse_report.build_lighthouse_by_url_for_report(conn)
    assert out["https://only-raw.com"]["top_failures"]


def test_build_edges_from_df_more_branches(monkeypatch) -> None:
    df = pd.DataFrame(
        {
            "url": ["https://example.com/"],
            "links": [""],
            "outlink_targets": ["https://other.com/page"],
        }
    )
    edges = edges_report.build_edges_from_df(df, "", True, 10, 1, 5, 0.0)
    assert edges == []

    class FakeResp:
        status_code = 200
        text = '<html><body><a href="/p">Link</a></body></html>'

        @property
        def headers(self):
            return {"Content-Type": "text/html"}

    session = MagicMock()
    session.get.return_value = FakeResp()
    monkeypatch.setattr("website_profiling.reporting.edges_report.requests.Session", lambda: session)
    with patch("website_profiling.reporting.edges_report.time.sleep") as sleep:
        edges_report.build_edges_from_df(
            pd.DataFrame({"url": ["https://example.com/"]}),
            "",
            True,
            10,
            1,
            5,
            0.5,
        )
        sleep.assert_called()

    def raise_result(_self):
        raise RuntimeError("worker failed")

    with patch("website_profiling.reporting.edges_report.as_completed") as completed:
        future = MagicMock()
        future.result = raise_result
        completed.return_value = [future]
        monkeypatch.setattr(
            "website_profiling.reporting.edges_report.ThreadPoolExecutor",
            lambda *a, **k: MagicMock(__enter__=lambda s: s, __exit__=lambda *a: None, submit=lambda fn, u: future),
        )
        session.get.return_value = FakeResp()
        result = edges_report.build_edges_from_df(
            pd.DataFrame({"url": ["https://example.com/"]}),
            "",
            True,
            10,
            1,
            5,
            0.0,
        )
        assert result == []


def test_content_analytics_remaining_lines() -> None:
    assert content_analytics._parse_top_keywords_items(object()) == []  # type: ignore[arg-type]
    assert content_analytics._parse_top_keywords_items("{bad-json") == []

    na_kw = pd.DataFrame([{"url": float("nan"), "status": "200", "top_keywords": json.dumps([{"word": "x", "count": 1}])}])
    assert content_analytics._build_text_content_analysis(na_kw)["vocabulary_stats"]["unique_terms"] == 0

    assert content_analytics._build_keyword_opportunities(pd.DataFrame({"url": ["x"]}), {"include_keyword_opportunities": "true"})["quick_wins"] == []

    only_404 = pd.DataFrame([{"url": "https://example.com/x", "status": "404", "top_keywords": "[]"}])
    assert content_analytics._build_text_content_analysis(only_404)["keyword_index"] == []

    spread_df = pd.DataFrame(
        [
            {
                "url": f"https://example.com/{i}",
                "status": "200",
                "top_keywords": json.dumps([{"word": "shared-six", "count": 1}]),
            }
            for i in range(6)
        ]
    )
    assert content_analytics._build_text_content_analysis(spread_df)["keyword_frequency_histogram"]["6-20"] == 1

    assert content_analytics._build_tech_stack_summary(
        pd.DataFrame([{"url": "https://example.com", "status": "200", "content_type": "application/pdf", "tech_stack": '["X"]'}])
    )["total_pages_analyzed"] == 0

    kw_df = pd.DataFrame([{"url": "https://example.com", "status": "200", "content_text": "uniquewords " * 20}])
    with patch("website_profiling.reporting.content_analytics.extract_candidates_from_df", return_value=[]):
        assert content_analytics._build_keyword_opportunities(kw_df, {"include_keyword_opportunities": "true"})["quick_wins"] == []
    with patch("website_profiling.reporting.content_analytics.extract_candidates_from_df", return_value=[{"word": "a", "volume": 0.1}]), patch(
        "website_profiling.reporting.content_analytics.score_keywords",
        return_value=[{"word": "a", "volume": 0.1, "difficulty": 80}],
    ), patch("website_profiling.reporting.content_analytics.cluster_keywords", return_value=[]):
        out = content_analytics._build_keyword_opportunities(kw_df, {"include_keyword_opportunities": "true"})
        assert out["high_value"]


def test_report_metadata_remaining_lines() -> None:
    df = pd.DataFrame(
        [
            {
                "url": "https://example.com/",
                "status": "200",
                "page_analysis": json.dumps({"external_links": ["https://example.com/internal", 99]}),
                "word_count": 0,
                "content_length": 0,
                "h1_count": 0,
                "script_count": 0,
                "link_stylesheet_count": 0,
            },
        ]
    )
    assert report_metadata._build_outbound_link_domains(df, "https://example.com/", 5) == []
    assert report_metadata._build_url_fingerprints(pd.DataFrame([{"url": "   ", "status": "200"}])) == []

    meta = report_metadata._build_report_metadata(
        pd.DataFrame([{"url": "https://example.com", "status": "200"}]),
        {},
        None,
        None,
        None,
        {},
        None,
        None,
        {"imported_at": "2026-01-01", "top_linking_sites": [], "sample_links": [], "latest_links": []},
    )
    assert "search_console" in meta["data_sources"]


def test_seo_summary_remaining_lines() -> None:
    df = pd.DataFrame(
        [
            {
                "url": "https://example.com/a",
                "status": "200",
                "title": "ok",
                "meta_description_len": 0,
                "h1_count": 2,
                "content_length": 100,
            },
            {
                "url": float("nan"),
                "status": "200",
                "title": "x",
                "meta_description_len": 80,
                "h1_count": 0,
                "content_length": 100,
            },
        ]
    )
    out = seo_summary._compute_summary_seo_issues(df)
    assert any(i["type"] == "h1_multi" for i in out["issues"]["seo"])


def test_lighthouse_report_remaining_lines(monkeypatch) -> None:
    cert_sock = MagicMock()
    cert_sock.getpeercert.return_value = {"notAfter": None}
    ctx = MagicMock()
    ctx.wrap_socket.return_value.__enter__.return_value = cert_sock
    with patch("website_profiling.reporting.lighthouse_report.ssl.create_default_context", return_value=ctx), patch(
        "website_profiling.reporting.lighthouse_report.socket.create_connection"
    ):
        assert lighthouse_report.fetch_site_ssl_expires_iso("example.com") is None

    by_url = {"https://www.example.com/": {"score": 1}}
    assert lighthouse_report._pick_lighthouse_summary(by_url, "https://www.example.com/", None, "example.com") is not None
    assert lighthouse_report._pick_lighthouse_summary(by_url, "", None, "example.com")["score"] == 1
    assert lighthouse_report._derive_expected_host("", pd.DataFrame({"url": [float("nan")]})) == ""

    conn = MagicMock()
    monkeypatch.setattr("website_profiling.db.read_lighthouse_page_summaries", lambda _c: {"https://empty.com": {}})
    monkeypatch.setattr("website_profiling.db.read_lh_runs_by_url", lambda _c: {"https://empty.com": []})
    assert lighthouse_report.build_lighthouse_by_url_for_report(conn) == {}

    assert lighthouse_report._derive_expected_host("https://host-only.com/", pd.DataFrame()) == "host-only.com"

    mismatch = lighthouse_report._pick_lighthouse_summary(
        {},
        "https://example.com/",
        {"url": "https://other-host.com/", "performance": 1},
        "example.com",
    )
    assert mismatch is None

    matched = lighthouse_report._pick_lighthouse_summary(
        {},
        "",
        {"url": "https://www.example.com/", "performance": 99},
        "example.com",
    )
    assert matched["performance"] == 99

    conn2 = MagicMock()
    monkeypatch.setattr(
        "website_profiling.db.read_lighthouse_page_summaries",
        lambda _c: {"https://needs-url.com": {"median_metrics": {"performance_score": 1}}},
    )
    monkeypatch.setattr("website_profiling.db.read_lh_runs_by_url", lambda _c: {})
    out2 = lighthouse_report.build_lighthouse_by_url_for_report(conn2)
    assert out2["https://needs-url.com"]["url"] == "https://needs-url.com"

    assert lighthouse_report.lighthouse_for_url({"https://example.com/": {"score": 9}}, "https://example.com")["score"] == 9
    assert lighthouse_report.lighthouse_for_url({"https://example.com": {"score": 7}}, "https://example.com/")["score"] == 7


def test_build_edges_remaining_lines(monkeypatch) -> None:
    df = pd.DataFrame({"url": ["https://example.com/"], "links": [None]})
    assert edges_report.build_edges_from_df(df, "", True, 10, 1, 5, 0.0) == []

    df_blank = pd.DataFrame({"url": ["https://example.com/"], "outlink_targets": [["  ", "https://example.com/about"]]})
    edges_blank = edges_report.build_edges_from_df(df_blank, "", False, 10, 1, 5, 0.0)
    assert ("https://example.com/", "https://example.com/about") in edges_blank

    df_external = pd.DataFrame({"url": ["https://example.com/"], "outlink_targets": ["https://external.com/page"]})
    assert edges_report.build_edges_from_df(df_external, "", True, 10, 1, 5, 0.0) == []

    class FakeResp:
        status_code = 404
        text = ""

        @property
        def headers(self):
            return {"Content-Type": "text/html"}

    session = MagicMock()
    session.get.return_value = FakeResp()
    monkeypatch.setattr("website_profiling.reporting.edges_report.requests.Session", lambda: session)
    assert edges_report.build_edges_from_df(
        pd.DataFrame({"url": ["https://example.com/"]}),
        "",
        True,
        10,
        1,
        5,
        0.0,
    ) == []


def test_builder_exposes_llm_keyword_cluster_imports() -> None:
    """Regression: LLM keyword cluster branch must not NameError after builder split."""
    import website_profiling.reporting.builder as builder_mod
    from website_profiling.analysis.text_hygiene import is_junk_semantic_term
    from website_profiling.ai_service_client import cluster_keywords_llm

    assert builder_mod.is_junk_semantic_term is is_junk_semantic_term
    assert builder_mod.cluster_keywords_llm is cluster_keywords_llm
