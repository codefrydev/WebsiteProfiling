"""Crawl row schema: single source for DataFrame columns and default field values."""

from __future__ import annotations

from typing import Any, Optional

# Core crawl columns (excluding optional outlink_targets).
CRAWL_ROW_COLUMNS: list[str] = [
    "url",
    "status",
    "content_type",
    "title",
    "outlinks",
    "response_time_ms",
    "content_length",
    "final_url",
    "meta_description",
    "meta_description_len",
    "h1",
    "h1_count",
    "canonical_url",
    "viewport_present",
    "viewport_content",
    "noindex",
    "has_schema",
    "heading_sequence",
    "heading_text",
    "images_without_alt",
    "images_total",
    "img_without_lazy",
    "img_without_dimensions",
    "aria_count",
    "mixed_content_count",
    "redirect_chain_length",
    "cache_control",
    "etag",
    "x_robots_tag",
    "strict_transport_security",
    "x_content_type_options",
    "x_frame_options",
    "content_security_policy",
    "script_count",
    "link_stylesheet_count",
    "total_js_bytes",
    "total_css_bytes",
    "word_count",
    "reading_level",
    "content_html_ratio",
    "top_keywords",
    "content_excerpt",
    "og_title",
    "og_description",
    "og_image",
    "og_type",
    "twitter_card",
    "twitter_title",
    "twitter_image",
    "tech_stack",
    "depth",
    "page_analysis",
    "fetch_method",
]


def empty_crawl_row_ext(
    url: str,
    headers_dict: Optional[dict] = None,
    redirect_chain_length: int = 0,
) -> dict[str, Any]:
    """Default SEO/performance extension fields when no HTML or on error."""
    h = headers_dict or {}
    return {
        "response_time_ms": "",
        "content_length": 0,
        "final_url": url,
        "meta_description": "",
        "meta_description_len": 0,
        "h1": "",
        "h1_count": 0,
        "canonical_url": "",
        "viewport_present": False,
        "viewport_content": "",
        "noindex": False,
        "has_schema": False,
        "heading_sequence": "",
        "heading_text": "",
        "images_without_alt": 0,
        "images_total": 0,
        "img_without_lazy": 0,
        "img_without_dimensions": 0,
        "aria_count": 0,
        "mixed_content_count": 0,
        "redirect_chain_length": redirect_chain_length,
        "cache_control": h.get("Cache-Control", ""),
        "etag": h.get("ETag", ""),
        "x_robots_tag": h.get("X-Robots-Tag", ""),
        "strict_transport_security": h.get("Strict-Transport-Security", ""),
        "x_content_type_options": h.get("X-Content-Type-Options", ""),
        "x_frame_options": h.get("X-Frame-Options", ""),
        "content_security_policy": h.get("Content-Security-Policy", ""),
        "script_count": 0,
        "link_stylesheet_count": 0,
        "total_js_bytes": 0,
        "total_css_bytes": 0,
        "word_count": 0,
        "reading_level": 0.0,
        "content_html_ratio": 0.0,
        "top_keywords": "[]",
        "content_excerpt": "",
        "og_title": "",
        "og_description": "",
        "og_image": "",
        "og_type": "",
        "twitter_card": "",
        "twitter_title": "",
        "twitter_image": "",
        "tech_stack": "[]",
        "depth": None,
        "page_analysis": "{}",
    }


def empty_crawl_row(
    url: Optional[str] = None,
    status: str | int = "error",
    *,
    content_type: str = "",
    title: str = "",
    outlinks: int = 0,
    fetch_method: str = "static",
    headers_dict: Optional[dict] = None,
    redirect_chain_length: int = 0,
    **overrides: Any,
) -> dict[str, Any]:
    """Build a full crawl result row with defaults; overrides merge on top."""
    row: dict[str, Any] = {
        "url": url,
        "status": status,
        "content_type": content_type,
        "title": title,
        "outlinks": outlinks,
        "fetch_method": fetch_method,
        **empty_crawl_row_ext(url or "", headers_dict, redirect_chain_length),
    }
    row.update(overrides)
    return row


def crawl_dataframe_columns(*, store_outlinks: bool = False) -> list[str]:
    """Column list for an empty crawl DataFrame."""
    cols = list(CRAWL_ROW_COLUMNS)
    if store_outlinks:
        cols.append("outlink_targets")
    return cols
