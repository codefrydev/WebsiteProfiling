"""
Load Google credentials from .secrets/google.json.
Supports OAuth (refresh_token) and service account.
Uses atomic file writes to avoid corruption from concurrent access.

Path resolution order:
  1. $GOOGLE_SECRETS_PATH env var
  2. $DATA_DIR/.secrets/google.json
  3. dirname(credentials_path from config) -- falls back to repo root
"""
from __future__ import annotations

import json
import os
import tempfile
from typing import Any

INSTALL_HINT = (
    "Install Google integration dependencies: "
    "pip install google-auth google-auth-oauthlib google-api-python-client "
    "google-analytics-data google-analytics-admin"
)


def _resolve_secrets_path(credentials_path: str | None = None) -> str:
    """Return the absolute path to .secrets/google.json using the same resolution logic as googleSecrets.js."""
    # 1. Explicit env override
    explicit = os.environ.get("GOOGLE_SECRETS_PATH", "").strip()
    if explicit:
        return os.path.abspath(explicit)

    # 2. DATA_DIR (Docker volume /data)
    data_dir = os.environ.get("DATA_DIR", "").strip()
    if data_dir:
        return os.path.join(os.path.abspath(data_dir), ".secrets", "google.json")

    # 3. Relative to credentials_path config key, or repo root
    if credentials_path and credentials_path.strip():
        return os.path.abspath(credentials_path.strip())

    # Fallback: look upward from this file to find repo root (contains src/__main__.py)
    here = os.path.dirname(os.path.abspath(__file__))
    candidate = here
    for _ in range(8):
        if os.path.isfile(os.path.join(candidate, "src", "__main__.py")):
            return os.path.join(candidate, ".secrets", "google.json")
        parent = os.path.dirname(candidate)
        if parent == candidate:
            break
        candidate = parent
    return os.path.join(here, ".secrets", "google.json")


def read_secrets(credentials_path: str | None = None) -> dict[str, Any]:
    """Read and return the secrets file. Returns {} if missing or invalid."""
    p = _resolve_secrets_path(credentials_path)
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def write_secrets_atomic(data: dict[str, Any], credentials_path: str | None = None) -> None:
    """Atomically write data to the secrets file."""
    p = _resolve_secrets_path(credentials_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp_fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(p), suffix=".tmp")
    try:
        with os.fdopen(tmp_fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, p)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def build_credentials(credentials_path: str | None = None):
    """
    Load Google OAuth2 credentials from the secrets file.
    Returns a google.oauth2.credentials.Credentials object (OAuth)
    or google.oauth2.service_account.Credentials (service account).
    Raises RuntimeError with a user-friendly message if not configured.
    Raises google.auth.exceptions.RefreshError if the refresh token is revoked.
    """
    try:
        from google.oauth2.credentials import Credentials
        from google.oauth2.service_account import Credentials as SACredentials
        from google.auth.transport.requests import Request
    except ImportError as e:
        raise ImportError(f"{INSTALL_HINT}\n({e})") from e

    secrets = read_secrets(credentials_path)
    auth_mode = secrets.get("authMode")

    if auth_mode == "service_account" and secrets.get("serviceAccount"):
        sa = secrets["serviceAccount"]
        scopes = [
            "https://www.googleapis.com/auth/webmasters.readonly",
            "https://www.googleapis.com/auth/analytics.readonly",
        ]
        creds = SACredentials.from_service_account_info(sa, scopes=scopes)
        return creds

    refresh_token = secrets.get("refreshToken")
    client_id = secrets.get("clientId") or os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = secrets.get("clientSecret") or os.environ.get("GOOGLE_CLIENT_SECRET", "")

    if not refresh_token:
        raise RuntimeError(
            "Google not connected. Open Integrations in the UI and click 'Connect with Google'."
        )
    if not client_id or not client_secret:
        raise RuntimeError(
            "Google Client ID or Secret missing. Complete Step 1 in Integrations."
        )

    creds = Credentials(
        token=None,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
    )
    # Refresh immediately to get a valid access token and catch revoked tokens early
    creds.refresh(Request())
    return creds
