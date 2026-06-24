"""Google OAuth router endpoints (consent + callback). Heavy logic is in the
coverage-omitted integrations/google/oauth.py; here we cover the thin router lines
and the stateless-state signing."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from website_profiling.api.deps import get_db
from website_profiling.api.main import app
from website_profiling.integrations.google import oauth as oauth_mod
from website_profiling.integrations.google.oauth import OAuthError


def _fake_db():
    yield MagicMock()


def _client() -> TestClient:
    app.dependency_overrides[get_db] = _fake_db
    return TestClient(app)


def teardown_function() -> None:
    app.dependency_overrides.clear()


def test_google_oauth_start_redirects_to_consent() -> None:
    url = "https://accounts.google.com/o/oauth2/v2/auth?client_id=x&state=y"
    with patch("website_profiling.integrations.google.oauth.oauth_start", return_value=url):
        resp = _client().get(
            "/api/integrations/google/auth?propertyId=1", follow_redirects=False
        )
    assert resp.status_code == 302
    assert resp.headers["location"] == url


def test_google_oauth_start_bad_input_returns_400() -> None:
    with patch(
        "website_profiling.integrations.google.oauth.oauth_start",
        side_effect=OAuthError("propertyId is required."),
    ):
        resp = _client().get("/api/integrations/google/auth", follow_redirects=False)
    assert resp.status_code == 400
    assert resp.json()["detail"] == "propertyId is required."


def test_google_oauth_callback_redirects_to_ui() -> None:
    url = "http://localhost:3000/?integrations=open&auth=success"
    with patch("website_profiling.integrations.google.oauth.oauth_callback", return_value=url):
        resp = _client().get(
            "/api/integrations/google/callback?code=abc&state=s", follow_redirects=False
        )
    assert resp.status_code == 302
    assert resp.headers["location"] == url


def test_oauth_state_roundtrip_tamper_and_expiry() -> None:
    state = oauth_mod.sign_state(42, "/integrations", now=1000)
    payload = oauth_mod.verify_state(state, now=1001)
    assert payload is not None
    assert payload["p"] == 42
    assert payload["r"] == "/integrations"
    # Tampered signature → rejected.
    assert oauth_mod.verify_state(state + "x", now=1001) is None
    # Expired → rejected.
    assert oauth_mod.verify_state(state, now=10_000) is None
    # Missing/garbage → rejected.
    assert oauth_mod.verify_state(None) is None
    assert oauth_mod.verify_state("no-dot") is None
