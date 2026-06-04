"""Singleton google_app_settings row (OAuth app credentials)."""
from __future__ import annotations

import os
from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ._common import _parse_json_field, _row_field

SINGLETON_ID = 1

_SCOPES = [
    "https://www.googleapis.com/auth/webmasters.readonly",
    "https://www.googleapis.com/auth/analytics.readonly",
]


def _row_to_dict(row: Any) -> dict[str, Any]:
    sa = _parse_json_field(_row_field(row, "service_account_json", index=3))
    return {
        "client_id": (str(_row_field(row, "client_id", index=1) or "")).strip(),
        "client_secret": (str(_row_field(row, "client_secret", index=2) or "")).strip(),
        "service_account_json": sa if isinstance(sa, dict) else None,
        "default_date_range_days": int(_row_field(row, "default_date_range_days", index=4) or 28),
        "updated_at": _row_field(row, "updated_at", index=5),
    }


def read_google_app_settings(conn: Connection | None = None) -> dict[str, Any]:
    """Read singleton app settings. Returns empty dict fields if missing."""
    from .pool import db_session

    def _read(c: Connection) -> dict[str, Any]:
        cur = c.execute(
            """
            SELECT id, client_id, client_secret, service_account_json,
                   default_date_range_days, updated_at
            FROM google_app_settings WHERE id = %s
            """,
            (SINGLETON_ID,),
        )
        row = cur.fetchone()
        if not row:
            return {
                "client_id": "",
                "client_secret": "",
                "service_account_json": None,
                "default_date_range_days": 28,
            }
        return _row_to_dict(row)

    if conn is not None:
        return _read(conn)
    with db_session() as c:
        return _read(c)


def save_google_app_settings(conn: Connection, patch: dict[str, Any]) -> None:
    """Merge patch into singleton row."""
    sets: list[str] = ["updated_at = now()"]
    vals: list[Any] = []

    if "client_id" in patch:
        sets.append("client_id = %s")
        vals.append(patch["client_id"])
    if "client_secret" in patch:
        sets.append("client_secret = %s")
        vals.append(patch["client_secret"])
    if "service_account_json" in patch:
        sa = patch["service_account_json"]
        sets.append("service_account_json = %s")
        vals.append(Json(sa) if sa is not None else None)
    if "default_date_range_days" in patch:
        sets.append("default_date_range_days = %s")
        vals.append(int(patch["default_date_range_days"] or 28))

    if len(vals) == 0:
        return

    vals.append(SINGLETON_ID)
    conn.execute(
        f"UPDATE google_app_settings SET {', '.join(sets)} WHERE id = %s",
        vals,
    )
    conn.commit()


def app_client_credentials(settings: dict[str, Any] | None = None) -> tuple[str, str]:
    """OAuth client id/secret from DB row, then env."""
    cfg = settings if settings is not None else read_google_app_settings()
    client_id = (cfg.get("client_id") or os.environ.get("GOOGLE_CLIENT_ID") or "").strip()
    client_secret = (
        (cfg.get("client_secret") or os.environ.get("GOOGLE_CLIENT_SECRET") or "").strip()
    )
    if not client_id or not client_secret:
        raise RuntimeError(
            "Google Client ID or Secret missing. Complete Step 1 in Integrations."
        )
    return client_id, client_secret


def has_service_account(settings: dict[str, Any] | None = None) -> bool:
    cfg = settings if settings is not None else read_google_app_settings()
    return bool(cfg.get("service_account_json"))


def build_service_account_credentials(settings: dict[str, Any] | None = None):
    from google.oauth2.service_account import Credentials as SACredentials

    cfg = settings if settings is not None else read_google_app_settings()
    sa = cfg.get("service_account_json")
    if not isinstance(sa, dict):
        raise RuntimeError("No service account configured in google_app_settings.")
    return SACredentials.from_service_account_info(sa, scopes=_SCOPES)


def default_date_range_days(settings: dict[str, Any] | None = None) -> int:
    cfg = settings if settings is not None else read_google_app_settings()
    return int(cfg.get("default_date_range_days") or 28)
