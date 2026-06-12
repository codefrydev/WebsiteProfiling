"""Unit tests for crawl page record builder (no network)."""

from website_profiling.crawl.page_record import PageRecordBuilder
from website_profiling.crawl.schema import CRAWL_ROW_COLUMNS, empty_crawl_row, empty_crawl_row_ext


def test_empty_crawl_row_has_core_fields() -> None:
    row = empty_crawl_row(url="https://a.com", status=200)
    assert row["url"] == "https://a.com"
    assert row["status"] == 200
    assert row["fetch_method"] == "static"
    assert row["page_analysis"] == "{}"


def test_empty_crawl_row_ext_headers() -> None:
    ext = empty_crawl_row_ext(
        "https://a.com",
        headers_dict={"Cache-Control": "no-cache", "X-Robots-Tag": "noindex"},
    )
    assert ext["cache_control"] == "no-cache"
    assert ext["x_robots_tag"] == "noindex"


def test_crawl_row_columns_match_dataframe_schema() -> None:
    assert "url" in CRAWL_ROW_COLUMNS
    assert "fetch_method" in CRAWL_ROW_COLUMNS
    assert "page_analysis" in CRAWL_ROW_COLUMNS


def test_build_robots_blocked_row() -> None:
    row = PageRecordBuilder.build_robots_blocked_row(
        "https://a.com", store_outlinks=True
    )
    assert row["status"] == "blocked_by_robots"
    assert row["outlink_targets"] == "[]"


def test_parse_page_content_minimal_html() -> None:
    builder = PageRecordBuilder(use_wappalyzer=False)
    html = "<html><head><title>Hi</title></head><body><h1>Hello</h1></body></html>"
    parsed = builder.parse_page_content(
        "https://a.com",
        html,
        "https://a.com",
        {},
        0,
    )
    assert parsed["title"] == "Hi"
    assert parsed["h1_text"] == "Hello"
    assert parsed["h1_count"] == 1
