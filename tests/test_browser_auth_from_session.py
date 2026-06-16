"""Regression tests for mapping a requests Session's auth onto browser context options.

`_browser_auth_from_session` must not assume `session.auth` is a 2-tuple — requests
also allows a callable auth handler and 1-element credentials.
"""
from __future__ import annotations

import requests

from website_profiling.crawl.fetchers.factory import _browser_auth_from_session


def test_none_session_returns_empty_options() -> None:
    assert _browser_auth_from_session(None) == ({}, None)


def test_basic_two_tuple_auth_maps_to_credentials() -> None:
    session = requests.Session()
    session.headers["X-Custom"] = "1"
    session.auth = ("user", "secret")
    headers, credentials = _browser_auth_from_session(session)
    assert credentials == {"username": "user", "password": "secret"}
    assert headers.get("X-Custom") == "1"
    # User-Agent is intentionally filtered out (the browser sets its own).
    assert "User-Agent" not in headers


def test_single_element_auth_defaults_password_to_empty() -> None:
    session = requests.Session()
    session.auth = ("user-only",)
    _, credentials = _browser_auth_from_session(session)
    assert credentials == {"username": "user-only", "password": ""}


def test_callable_auth_handler_is_ignored_without_raising() -> None:
    session = requests.Session()
    session.auth = lambda request: request  # e.g. HTTPDigestAuth / custom handler
    _, credentials = _browser_auth_from_session(session)
    assert credentials is None
