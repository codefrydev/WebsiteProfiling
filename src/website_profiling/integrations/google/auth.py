"""
Google credentials from PostgreSQL (google_app_settings + properties).
"""
from __future__ import annotations

from typing import Any

INSTALL_HINT = (
    "Install Google integration dependencies: "
    "pip install google-auth google-auth-oauthlib google-api-python-client "
    "google-analytics-data google-analytics-admin"
)


def read_secrets() -> dict[str, Any]:
    """Compat shim: app settings from DB in camelCase shape (no global refresh token)."""
    from ...db.google_app_store import read_google_app_settings

    row = read_google_app_settings()
    sa = row.get("service_account_json")
    return {
        "clientId": row.get("client_id") or "",
        "clientSecret": row.get("client_secret") or "",
        "dateRangeDays": row.get("default_date_range_days") or 28,
        "serviceAccount": sa,
        "authMode": "service_account" if sa else None,
        "refreshToken": None,
        "gscSiteUrl": None,
        "ga4PropertyId": None,
    }


def _app_client_credentials() -> tuple[str, str]:
    from ...db.google_app_store import app_client_credentials

    return app_client_credentials()


def _property_google_auth(property_id: int) -> tuple[str, str | None, str]:
    from ...db import db_session
    from ...db.property_store import get_property_by_id

    with db_session() as conn:
        prop = get_property_by_id(conn, property_id)
    if not prop:
        raise RuntimeError(f"Property id {property_id} not found.")
    token = (prop.get("google_refresh_token") or "").strip()
    domain = prop.get("canonical_domain") or "this site"
    return token, prop.get("google_auth_mode"), domain


def build_credentials(property_id: int | None = None):
    """
    Load Google OAuth2 credentials.
    property_id is required for OAuth user tokens.
    Service account uses google_app_settings.service_account_json (app-wide).
    """
    try:
        from google.oauth2.credentials import Credentials
        from google.auth.transport.requests import Request
    except ImportError as e:
        raise ImportError(f"{INSTALL_HINT}\n({e})") from e

    from ...db.google_app_store import has_service_account, build_service_account_credentials

    if property_id is not None:
        refresh_token, prop_auth_mode, domain = _property_google_auth(property_id)
        if prop_auth_mode == "service_account" or (not refresh_token and has_service_account()):
            return build_service_account_credentials()
        if not refresh_token:
            raise RuntimeError(
                f"Google not connected for {domain}. "
                "Set Site URL, open Integrations, and click Connect with Google for this site, "
                "or upload an app-wide service account JSON in Integrations."
            )
        client_id, client_secret = _app_client_credentials()
        creds = Credentials(
            token=None,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=client_id,
            client_secret=client_secret,
        )
        creds.refresh(Request())
        return creds

    if has_service_account():
        return build_service_account_credentials()

    raise RuntimeError(
        "Google API access requires a property context. "
        "Set Site URL in audit settings, connect Google for that site, then run fetch again."
    )


def resolve_google_targets(
    property_id: int | None = None,
) -> tuple[str, str, int]:
    """Return (gsc_site_url, ga4_property_id, date_range_days) for fetch."""
    from ...db.google_app_store import default_date_range_days

    default_days = default_date_range_days()

    if property_id is None:
        raise RuntimeError(
            "No property selected for Google fetch. Set Site URL and run audit again."
        )

    from ...db import db_session
    from ...db.property_store import get_property_google_config

    with db_session() as conn:
        cfg = get_property_google_config(conn, property_id)
    days = cfg.get("date_range_days") or default_days
    return (
        cfg.get("gsc_site_url") or "",
        cfg.get("ga4_property_id") or "",
        int(days) if days else default_days,
    )
