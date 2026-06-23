"""
Google OAuth consent + callback, moved server-side (FastAPI) from the former Next.js routes.

Stateless by design: the property id + return path + expiry are signed into the OAuth `state`
parameter (HMAC) rather than stored in cookies. This is what lets the flow work behind the .NET
BFF, which terminates auth and does not forward cookies to FastAPI. Google echoes `state` back on
the callback, so no server-side session is needed.

This module lives under integrations/google/* which is intentionally omitted from the coverage
gates; the API router endpoints that call it stay thin.
"""
from __future__ import annotations

import base64
import hmac
import json
import os
import time
from hashlib import sha256
from typing import Any
from urllib.parse import urlencode

GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"

SCOPES = " ".join(
    [
        "https://www.googleapis.com/auth/webmasters.readonly",
        "https://www.googleapis.com/auth/analytics.readonly",
        "https://www.googleapis.com/auth/adwords",
    ]
)

STATE_TTL_SECONDS = 600  # 10 minutes to complete consent


class OAuthError(Exception):
    """Raised for bad input on the consent-start step (mapped to HTTP 400 by the router)."""


def _state_secret() -> str:
    secret = (os.environ.get("AUTH_SECRET") or os.environ.get("SESSION_SECRET") or "").strip()
    # Fall back to a fixed dev secret so local (auth-disabled) flows still round-trip.
    return secret or "google-oauth-dev-state-secret"


def redirect_uri() -> str:
    return (
        os.environ.get("GOOGLE_REDIRECT_URI")
        or "http://localhost:8090/api/integrations/google/callback"
    )


def _app_base() -> str:
    """Browser-facing app origin for the final redirect back into the UI."""
    return (os.environ.get("APP_PUBLIC_URL") or "http://localhost:3000").rstrip("/")


def _b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _unb64(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def sign_state(property_id: int, return_path: str, now: float | None = None) -> str:
    payload = {
        "p": int(property_id),
        "r": return_path or "/",
        "e": int((now if now is not None else time.time()) + STATE_TTL_SECONDS),
    }
    body = _b64(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(_state_secret().encode("utf-8"), body.encode("ascii"), sha256).hexdigest()
    return f"{body}.{sig}"


def verify_state(state: str | None, now: float | None = None) -> dict[str, Any] | None:
    if not state or "." not in state:
        return None
    body, _, sig = state.partition(".")
    expected = hmac.new(_state_secret().encode("utf-8"), body.encode("ascii"), sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        return None
    try:
        payload = json.loads(_unb64(body).decode("utf-8"))
    except (ValueError, json.JSONDecodeError):
        return None
    if int(payload.get("e", 0)) < int(now if now is not None else time.time()):
        return None
    return payload


def _safe_return_path(raw: str | None) -> str:
    """Only allow same-origin relative paths (avoid open redirects)."""
    if not raw or not raw.startswith("/") or raw.startswith("//"):
        return "/"
    return raw


def build_consent_url(client_id: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
        "state": state,
    }
    return f"{GOOGLE_AUTH_ENDPOINT}?{urlencode(params)}"


def _exchange_code(code: str, client_id: str, client_secret: str) -> str | None:
    import requests

    resp = requests.post(
        GOOGLE_TOKEN_ENDPOINT,
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri(),
            "grant_type": "authorization_code",
        },
        timeout=15,
    )
    data = resp.json() if resp.content else {}
    if not resp.ok:
        return None
    return data.get("refresh_token")


def _ui_redirect(return_path: str, params: dict[str, str]) -> str:
    sep = "&" if "?" in return_path else "?"
    return f"{_app_base()}{return_path}{sep}{urlencode(params)}"


def oauth_start(conn: Any, property_id: int | None, start_url: str | None, return_to: str | None) -> str:
    """Resolve the property, build the Google consent URL. Raises OAuthError on bad input."""
    from ...db.google_app_store import app_client_credentials
    from ...db.property_store import resolve_property_id_from_start_url

    pid = property_id
    if pid is None and start_url:
        pid = resolve_property_id_from_start_url(conn, start_url.strip())
    if pid is None or pid <= 0:
        raise OAuthError("propertyId is required. Set Site URL and connect from Integrations.")

    client_id, _client_secret = app_client_credentials()
    if not client_id:
        raise OAuthError("Google client ID missing. Complete Step 1 in Integrations.")

    state = sign_state(pid, _safe_return_path(return_to))
    return build_consent_url(client_id, state)


def oauth_callback(conn: Any, code: str | None, state: str | None, error: str | None) -> str:
    """Validate state, exchange the code, persist the refresh token. Always returns a UI redirect URL."""
    from ...db.google_app_store import app_client_credentials
    from ...db.property_store import apply_property_google_credentials_patch

    payload = verify_state(state)
    return_path = _safe_return_path(payload.get("r") if payload else None)

    if error:
        return _ui_redirect(return_path, {"integrations": "open", "auth": "error", "reason": error})
    if payload is None:
        return _ui_redirect(
            return_path,
            {"integrations": "open", "auth": "error", "reason": "Invalid or expired state."},
        )
    if not code:
        return _ui_redirect(
            return_path,
            {"integrations": "open", "auth": "error", "reason": "No authorization code received."},
        )

    client_id, client_secret = app_client_credentials()
    if not client_id or not client_secret:
        return _ui_redirect(
            return_path,
            {"integrations": "open", "auth": "error", "reason": "Client credentials missing."},
        )

    refresh_token = _exchange_code(code, client_id, client_secret)
    if not refresh_token:
        return _ui_redirect(
            return_path,
            {"integrations": "open", "auth": "error", "reason": "Token exchange failed."},
        )

    apply_property_google_credentials_patch(
        conn, int(payload["p"]), refresh_token=refresh_token, auth_mode="oauth"
    )
    return _ui_redirect(return_path, {"integrations": "open", "auth": "success"})
