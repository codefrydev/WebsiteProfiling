"""
Unit tests for src.common (normalize_link, parse_links_serialized).
"""
import sys
import os

# Allow importing src
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from src.common import normalize_link, parse_links_serialized


class TestNormalizeLink:
    def test_empty_or_none(self):
        assert normalize_link("https://example.com/", "") is None
        assert normalize_link("https://example.com/", None) is None

    def test_mailto_javascript_ignored(self):
        assert normalize_link("https://example.com/", "mailto:foo@bar.com") is None
        assert normalize_link("https://example.com/", "javascript:void(0)") is None
        assert normalize_link("https://example.com/", "tel:+123") is None
        assert normalize_link("https://example.com/", "data:text/html,foo") is None

    def test_absolute_http(self):
        assert normalize_link("https://example.com/", "https://other.com/path") == "https://other.com/path"
        assert normalize_link("https://example.com/", "http://other.com/path") == "http://other.com/path"

    def test_relative(self):
        assert normalize_link("https://example.com/foo/", "bar") == "https://example.com/foo/bar"
        assert normalize_link("https://example.com/foo/", "/bar") == "https://example.com/bar"

    def test_fragment_removed(self):
        out = normalize_link("https://example.com/", "https://example.com/page#section")
        assert out == "https://example.com/page"

    def test_scheme_non_http_rejected(self):
        assert normalize_link("https://example.com/", "ftp://x.com") is None
        assert normalize_link("https://example.com/", "file:///local") is None

    def test_trailing_slash_stripped(self):
        assert normalize_link("https://example.com", "https://example.com/page/") == "https://example.com/page"


class TestParseLinksSerialized:
    def test_empty(self):
        assert parse_links_serialized("") == []
        assert parse_links_serialized(None) == []
        assert parse_links_serialized(float("nan")) == []

    def test_list_string(self):
        # Python literal_eval requires quoted strings inside the list
        assert parse_links_serialized("['https://a.com','https://b.com']") == ["https://a.com", "https://b.com"]
        assert parse_links_serialized('["https://a.com", "https://b.com"]') == ["https://a.com", "https://b.com"]

    def test_comma_separated(self):
        assert parse_links_serialized("https://a.com, https://b.com") == ["https://a.com", "https://b.com"]

    def test_list_type(self):
        assert parse_links_serialized(["https://a.com", "https://b.com"]) == ["https://a.com", "https://b.com"]

    def test_single_url(self):
        assert parse_links_serialized("https://example.com/page") == ["https://example.com/page"]
