"""Regression tests for stripping the leading ``www.`` host label.

`str.lstrip("www.")` strips any leading char in the set {'w','.'}, so it corrupts
hosts like ``www.washington.edu`` (-> ``ashington.edu``). `strip_www_prefix`
removes only a single literal ``www.`` prefix.
"""
from __future__ import annotations

from website_profiling.common import strip_www_prefix
from website_profiling.integrations.google.normalize import normalize_url


def test_removes_only_the_leading_www_label() -> None:
    assert strip_www_prefix("www.example.com") == "example.com"


def test_does_not_eat_into_the_host() -> None:
    # The lstrip bug would have produced "ashington.edu".
    assert strip_www_prefix("www.washington.edu") == "washington.edu"


def test_non_www_hosts_are_untouched() -> None:
    assert strip_www_prefix("web.example.com") == "web.example.com"
    assert strip_www_prefix("example.com") == "example.com"
    assert strip_www_prefix("") == ""


def test_normalize_url_strips_www_label_not_chars() -> None:
    assert normalize_url("https://www.washington.edu/admissions/") == "washington.edu/admissions/"


def test_normalize_url_preserves_w_prefixed_host() -> None:
    assert normalize_url("https://web.example.com") == "web.example.com/"
