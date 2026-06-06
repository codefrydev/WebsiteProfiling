from website_profiling.analysis.log_parser import parse_access_log_lines, compare_log_to_crawl


def test_parse_access_log_lines_counts_googlebot() -> None:
    lines = [
        '127.0.0.1 - - [10/Oct/2023:13:55:36 +0000] "GET /page HTTP/1.1" 200 1234 "-" "Mozilla/5.0 (compatible; Googlebot/2.1)"',
    ]
    out = parse_access_log_lines(lines)
    assert out["googlebot_hits"] == 1
    assert out["top_paths"][0]["path"] == "/page"


def test_parse_access_log_lines_skips_blank_and_comments() -> None:
    lines = ["", "# comment", "not-a-log-line"]
    out = parse_access_log_lines(lines)
    assert out["parsed_lines"] == 0


def test_compare_log_to_crawl() -> None:
    log = {"top_paths": [{"path": "/only-in-log", "hits": 5}]}
    crawl = ["https://example.com/crawled"]
    cmp = compare_log_to_crawl(log, crawl, "https://example.com")
    assert "/only-in-log" in cmp["log_only_paths"]


def test_compare_log_to_crawl_skips_bad_urls() -> None:
    from unittest.mock import patch

    log = {"top_paths": [{"path": "/a", "hits": 1}]}
    with patch("urllib.parse.urlparse", side_effect=ValueError("bad")):
        cmp = compare_log_to_crawl(log, ["http://x.com/y"], "https://example.com")
    assert cmp["crawl_only_count"] == 0
