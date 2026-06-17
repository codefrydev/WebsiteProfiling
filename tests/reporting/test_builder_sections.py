"""Unit tests for the report-builder section helpers extracted from builder.py."""
from __future__ import annotations

import pandas as pd

from website_profiling.reporting.builder_sections import (
    build_content_url_lists,
    build_links_list,
)


def test_content_url_lists_classifies_issues() -> None:
    df = pd.DataFrame([
        {  # row 0: a problem page on every axis
            "url": "https://a.com/1", "status": "200", "h1_count": 0, "title": "",
            "meta_description_len": 0, "content_length": 50, "canonical_url": "",
            "images_without_alt": 2, "images_total": 3, "img_without_lazy": 1,
            "img_without_dimensions": 1, "response_time_ms": 3000, "html_lang": "",
            "viewport_present": False, "reading_level": 15, "word_count": 50,
        },
        {  # row 1: long title/meta, multiple h1, canonical mismatch
            "url": "https://a.com/2", "status": "200", "h1_count": 2, "title": "T" * 70,
            "meta_description_len": 300, "content_length": 5000,
            "canonical_url": "https://a.com/other", "images_without_alt": 0, "images_total": 1,
            "img_without_lazy": 0, "img_without_dimensions": 0, "response_time_ms": 100,
            "html_lang": "en", "viewport_present": True, "reading_level": 5, "word_count": 500,
        },
    ])
    out = build_content_url_lists(df, df)  # both rows are 2xx

    u1 = "https://a.com/1"
    assert {"url": u1, "title": ""} in out["missing_h1"]
    assert {"url": u1} in out["missing_title"]
    assert any(r["url"] == u1 for r in out["missing_meta_desc"])
    assert any(r["url"] == u1 for r in out["thin_content"])
    assert any(r["url"] == u1 for r in out["missing_canonical"])
    assert any(r["url"] == u1 for r in out["missing_alt"])
    assert any(r["url"] == u1 for r in out["missing_lazy"])
    assert any(r["url"] == u1 for r in out["missing_dimensions"])
    assert any(r["url"] == u1 for r in out["slow_response"])
    assert any(r["url"] == u1 for r in out["missing_html_lang"])
    assert any(r["url"] == u1 for r in out["invalid_viewport"])
    assert any(r["url"] == u1 for r in out["high_reading_level"])
    assert any(r["url"] == u1 for r in out["very_thin_content"])

    u2 = "https://a.com/2"
    assert any(r["url"] == u2 for r in out["multiple_h1"])
    assert any(r["url"] == u2 for r in out["meta_desc_long"])
    assert any(r["url"] == u2 for r in out["title_long"])
    assert any(r["url"] == u2 for r in out["canonical_mismatch"])


def test_links_list_maps_fields_and_overlays() -> None:
    df = pd.DataFrame([
        {
            "url": "https://a.com/p", "status": "200", "title": "Hi", "content_length": 1234,
            "word_count": 300, "response_time_ms": 150, "depth": 2, "outlinks": 5,
            "h1_count": 1, "noindex": True, "images_total": 4, "reading_level": 7.5,
            "content_html_ratio": 12.3456,
            "page_analysis": '{"internal_link_count": 3, "external_link_count": 1}',
        },
    ])
    in_degree = {"https://a.com/p": 9}
    ml_bundle = {
        "language_by_url": {"https://a.com/p": "en"},
        "keyphrases_by_url": {"https://a.com/p": ["seo", "audit"]},
        "url_duplicate_group_id": {"https://a.com/p": 4},
    }
    links = build_links_list(df, in_degree, {}, ml_bundle)

    assert len(links) == 1
    r = links[0]
    assert r["url"] == "https://a.com/p"
    assert r["inlinks"] == 9
    assert r["content_length"] == 1234
    assert r["word_count"] == 300
    assert r["response_time_ms"] == 150
    assert r["depth"] == 2
    assert r["outlinks"] == 5
    assert r["h1_count"] == 1
    assert r["noindex"] is True
    assert r["reading_level"] == 7.5
    assert r["content_html_ratio"] == 12.35  # rounded to 2dp
    assert r["internal_link_count"] == 3
    assert r["external_link_count"] == 1
    assert r["detected_language"] == "en"
    assert r["keyphrases"] == ["seo", "audit"]
    assert r["duplicate_group_id"] == 4
    assert "lighthouse" in r


def test_links_list_skips_blank_urls() -> None:
    df = pd.DataFrame([{"url": "", "status": "200"}, {"url": None, "status": "200"}])
    assert build_links_list(df, {}, {}, {}) == []
