"""Tests for crawl workbook ZIP export."""
from __future__ import annotations

import zipfile
import io

from website_profiling.tools.export_crawl_workbook import build_crawl_workbook_zip


def test_build_workbook_zip_contains_issues_csv():
    payload = {
        "links": [{"url": "https://ex.com/", "status": "200", "title": "Home", "inlinks": 1, "outlinks": 2}],
        "categories": [{"name": "SEO", "issues": [{"message": "Missing title", "url": "https://ex.com/x", "priority": "High"}]}],
        "link_edges": [{"from_url": "https://ex.com/", "to_url": "https://ex.com/x", "anchor_text": "x", "rel": "", "is_nofollow": False, "link_type": "internal"}],
    }
    raw = build_crawl_workbook_zip(payload)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = set(zf.namelist())
    assert "internal_urls.csv" in names
    assert "issues.csv" in names
    assert "links.csv" in names


def test_build_workbook_zip_custom_fields_columns():
    payload = {
        "links": [
            {
                "url": "https://ex.com/p",
                "custom_extract": "SKU-1",
                "custom_fields": '{"price":"9.99","sku":"SKU-1"}',
            }
        ],
    }
    raw = build_crawl_workbook_zip(payload)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        body = zf.read("custom_fields.csv").decode("utf-8")
    assert "price" in body
    assert "9.99" in body
    assert "SKU-1" in body


def test_build_workbook_zip_all_sheets():
    payload = {
        "links": [
            {
                "url": "https://ex.com/",
                "status": "200",
                "title": "Home",
                "inlinks": 1,
                "outlinks": 2,
                "custom_extract": "x",
                "custom_fields": '{"a":"1"}',
            }
        ],
        "categories": [{"name": "SEO", "issues": [{"message": "x", "url": "https://ex.com/y", "priority": "High"}]}],
        "link_edges": [{"from_url": "https://ex.com/", "to_url": "https://ex.com/y", "anchor_text": "y", "rel": "", "is_nofollow": False, "link_type": "internal"}],
        "redirects": [{"url": "https://ex.com/old", "message": "301", "priority": "Low", "recommendation": "fix"}],
    }
    raw = build_crawl_workbook_zip(payload)
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        names = set(zf.namelist())
    assert "custom_fields.csv" in names
    assert "redirects.csv" in names
