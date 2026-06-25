"""Properties table: per-domain Google OAuth and GSC/GA4 mapping."""
from __future__ import annotations

import re
from typing import Any, Optional
from urllib.parse import urlparse

from psycopg import Connection

from ._common import _row_field

_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$")
_RESERVED = frozenset({"http", "https", "www"})


def _extract_hostname(url: str) -> str:
    try:
        host = urlparse(str(url or "")).hostname
        return host.lower() if host else ""
    except Exception:
        return ""


def canonical_domain_from_start_url(start_url: str) -> str:
    """Hostname from start URL (lowercase), aligned with web canonicalDomainFromPayload."""
    raw = (start_url or "").strip()
    if not raw:
        return ""
    href = raw if raw.startswith(("http://", "https://")) else f"https://{raw}"
    return _extract_hostname(href)


def derive_property_name(domain: str, site_url: str = "") -> str:
    if domain:
        return domain
    host = _extract_hostname(site_url)
    return host or "Site"


def is_valid_canonical_domain(domain: str) -> bool:
    """Reject partial URLs / keystroke fragments (e.g. ``http``, ``codefrydev.i``)."""
    d = (domain or "").strip().lower().rstrip(".")
    if len(d) < 4 or "." not in d or d in _RESERVED:
        return False
    labels = d.split(".")
    if len(labels) < 2:
        return False
    for label in labels:
        if not label or len(label) > 63 or not _LABEL_RE.match(label):
            return False
    # Real TLDs are at least two characters (excludes ``codefrydev.i`` while typing).
    if len(labels[-1]) < 2:
        return False
    return True


def upsert_property_by_domain(
    conn: Connection,
    name: str,
    canonical_domain: str,
    site_url: str | None = None,
) -> int:
    domain = (canonical_domain or "").strip().lower().rstrip(".")
    if not domain:
        raise ValueError("canonical_domain is required")
    if not is_valid_canonical_domain(domain):
        raise ValueError(f"canonical_domain is not a valid domain: {domain!r}")
    cur = conn.execute(
        """
        INSERT INTO properties (name, canonical_domain, site_url, updated_at)
        VALUES (%s, %s, %s, now())
        ON CONFLICT (canonical_domain) DO UPDATE SET
            name = EXCLUDED.name,
            site_url = COALESCE(EXCLUDED.site_url, properties.site_url),
            updated_at = now()
        RETURNING id
        """,
        (name.strip() or domain, domain, site_url),
    )
    row = cur.fetchone()
    conn.commit()
    return int(_row_field(row, "id", index=0))


def lookup_property_id_from_start_url(conn: Connection, start_url: str) -> int | None:
    """Read-only: resolve an existing property from a start URL (no insert)."""
    domain = canonical_domain_from_start_url(start_url)
    if not domain or not is_valid_canonical_domain(domain):
        return None
    prop = get_property_by_domain(conn, domain)
    return int(prop["id"]) if prop else None


def ensure_property_from_start_url(conn: Connection, start_url: str) -> int | None:
    """Create or return a property when the user explicitly connects or runs a job."""
    domain = canonical_domain_from_start_url(start_url)
    if not domain or not is_valid_canonical_domain(domain):
        return None
    prop = get_property_by_domain(conn, domain)
    if prop:
        return int(prop["id"])
    return upsert_property_by_domain(
        conn,
        derive_property_name(domain, start_url),
        domain,
        start_url.strip() or None,
    )


def resolve_property_id_from_start_url(conn: Connection, start_url: str) -> int | None:
    """Backward-compatible alias for read-only lookup (does not create rows)."""
    return lookup_property_id_from_start_url(conn, start_url)


def get_property_by_id(conn: Connection, property_id: int) -> dict[str, Any] | None:
    cur = conn.execute(
        """
        SELECT id, name, canonical_domain, site_url,
               gsc_site_url, ga4_property_id,
               google_auth_mode, google_refresh_token,
               google_connected_at, google_connected_email,
               google_date_range_days,
               default_crawl_preset, crawl_authorized_at
        FROM properties WHERE id = %s
        """,
        (property_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return _row_to_property(row)


def get_property_by_domain(conn: Connection, domain: str) -> dict[str, Any] | None:
    cur = conn.execute(
        """
        SELECT id, name, canonical_domain, site_url,
               gsc_site_url, ga4_property_id,
               google_auth_mode, google_refresh_token,
               google_connected_at, google_connected_email,
               google_date_range_days,
               default_crawl_preset, crawl_authorized_at
        FROM properties WHERE canonical_domain = %s
        """,
        ((domain or "").strip().lower(),),
    )
    row = cur.fetchone()
    if not row:
        return None
    return _row_to_property(row)


def _row_to_property(row: Any) -> dict[str, Any]:
    connected_at = _row_field(row, "google_connected_at", index=8)
    crawl_auth = _row_field(row, "crawl_authorized_at", index=12)
    return {
        "id": int(_row_field(row, "id", index=0)),
        "name": _row_field(row, "name", index=1),
        "canonical_domain": _row_field(row, "canonical_domain", index=2),
        "site_url": _row_field(row, "site_url", index=3),
        "gsc_site_url": _row_field(row, "gsc_site_url", index=4),
        "ga4_property_id": _row_field(row, "ga4_property_id", index=5),
        "google_auth_mode": _row_field(row, "google_auth_mode", index=6),
        "google_refresh_token": _row_field(row, "google_refresh_token", index=7),
        "google_connected_at": connected_at.isoformat() if connected_at else None,
        "google_connected_email": _row_field(row, "google_connected_email", index=9),
        "google_date_range_days": _row_field(row, "google_date_range_days", index=10),
        "default_crawl_preset": _row_field(row, "default_crawl_preset", index=11),
        "crawl_authorized_at": crawl_auth.isoformat() if crawl_auth else None,
    }


def update_property_google(conn: Connection, property_id: int, patch: dict[str, Any]) -> None:
    """Merge Google-related fields on a property row."""
    allowed = {
        "gsc_site_url",
        "ga4_property_id",
        "google_auth_mode",
        "google_refresh_token",
        "google_connected_at",
        "google_connected_email",
        "google_date_range_days",
    }
    sets: list[str] = []
    vals: list[Any] = []
    for key, value in patch.items():
        if key not in allowed:
            continue
        sets.append(f"{key} = %s")
        vals.append(value)
    if not sets:
        return
    sets.append("updated_at = now()")
    vals.append(property_id)
    conn.execute(
        f"UPDATE properties SET {', '.join(sets)} WHERE id = %s",
        vals,
    )
    conn.commit()


def get_property_google_config(conn: Connection, property_id: int) -> dict[str, Any]:
    """Config for fetch/auth — includes refresh token; do not log."""
    prop = get_property_by_id(conn, property_id)
    if not prop:
        raise RuntimeError(f"Property id {property_id} not found.")
    return {
        "property_id": property_id,
        "gsc_site_url": (prop.get("gsc_site_url") or "").strip(),
        "ga4_property_id": (prop.get("ga4_property_id") or "").strip(),
        "google_auth_mode": prop.get("google_auth_mode"),
        "google_refresh_token": prop.get("google_refresh_token"),
        "date_range_days": int(prop.get("google_date_range_days") or 0) or None,
    }


def list_properties_public(conn: Connection) -> list[dict[str, Any]]:
    """All properties without refresh tokens."""
    cur = conn.execute(
        """
        SELECT id, name, canonical_domain, site_url,
               gsc_site_url, ga4_property_id,
               google_auth_mode, google_connected_at, google_connected_email,
               google_date_range_days, crawl_authorized_at
        FROM properties ORDER BY name ASC
        """
    )
    out: list[dict[str, Any]] = []
    for row in cur.fetchall():
        connected_at = _row_field(row, "google_connected_at", index=7)
        crawl_auth = _row_field(row, "crawl_authorized_at", index=10)
        out.append({
            "id": int(_row_field(row, "id", index=0)),
            "name": _row_field(row, "name", index=1),
            "canonical_domain": _row_field(row, "canonical_domain", index=2),
            "site_url": _row_field(row, "site_url", index=3),
            "gsc_site_url": _row_field(row, "gsc_site_url", index=4),
            "ga4_property_id": _row_field(row, "ga4_property_id", index=5),
            "google_auth_mode": _row_field(row, "google_auth_mode", index=6),
            "google_connected": connected_at is not None,
            "google_connected_at": connected_at.isoformat() if connected_at else None,
            "google_connected_email": _row_field(row, "google_connected_email", index=8),
            "google_date_range_days": _row_field(row, "google_date_range_days", index=9),
            "crawl_authorized_at": crawl_auth.isoformat() if crawl_auth else None,
        })
    return out


def get_property_id_by_domain(conn: Connection, domain: str) -> int | None:
    """Resolve property id from canonical domain (case-insensitive)."""
    normalized = (domain or "").strip().lower()
    if not normalized:
        return None
    prop = get_property_by_domain(conn, normalized)
    return int(prop["id"]) if prop else None


def resolve_property_id_for_page(
    conn: Connection,
    page_url: str,
    property_id_str: str | None = None,
    domain_str: str | None = None,
) -> int | None:
    """Resolve property ID from explicit param, domain, or URL hostname."""
    if property_id_str:
        try:
            return int(property_id_str)
        except (ValueError, TypeError):
            pass

    if domain_str:
        prop_id = get_property_id_by_domain(conn, domain_str)
        if prop_id is not None:
            return prop_id

    host = _extract_hostname(page_url)
    if host:
        return get_property_id_by_domain(conn, host)
    return None


def get_property_ops(conn: Connection, property_id: int) -> dict[str, Any] | None:
    cur = conn.execute(
        "SELECT schedule_cron, alert_webhook_url, alert_email FROM properties WHERE id = %s",
        (property_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    return {
        "schedule_cron": _row_field(row, "schedule_cron", index=0),
        "alert_webhook_url": _row_field(row, "alert_webhook_url", index=1),
        "alert_email": _row_field(row, "alert_email", index=2),
    }


def update_property_ops(
    conn: Connection,
    property_id: int,
    *,
    schedule_cron: str | None,
    alert_webhook_url: str | None,
    alert_email: str | None,
) -> None:
    conn.execute(
        """
        UPDATE properties
        SET schedule_cron     = %s,
            alert_webhook_url = %s,
            alert_email       = %s,
            updated_at        = now()
        WHERE id = %s
        """,
        (schedule_cron, alert_webhook_url, alert_email, property_id),
    )
    conn.commit()


def delete_property(conn: Connection, property_id: int) -> bool:
    cur = conn.execute(
        "DELETE FROM properties WHERE id = %s RETURNING id",
        (property_id,),
    )
    deleted = cur.fetchone() is not None
    conn.commit()
    return deleted


def update_property_crawl_preset(
    conn: Connection,
    property_id: int,
    preset: str | None,
) -> None:
    conn.execute(
        "UPDATE properties SET default_crawl_preset = %s, updated_at = now() WHERE id = %s",
        (preset, property_id),
    )
    conn.commit()


def authorize_property_crawl(conn: Connection, property_id: int) -> None:
    """Mark property as crawl-authorized (OAuth flow)."""
    conn.execute(
        "UPDATE properties SET crawl_authorized_at = now(), updated_at = now() WHERE id = %s",
        (property_id,),
    )
    conn.commit()


def get_property_google_public_status(conn: Connection, property_id: int) -> dict[str, Any]:
    row = get_property_by_id(conn, property_id)
    if not row:
        return {
            "connected": False,
            "authMode": None,
            "gscSiteUrl": None,
            "ga4PropertyId": None,
            "dateRangeDays": 28,
            "connectedEmail": None,
            "connectedAt": None,
        }
    connected_at = row.get("google_connected_at")
    return {
        "connected": connected_at is not None,
        "authMode": row.get("google_auth_mode"),
        "gscSiteUrl": row.get("gsc_site_url"),
        "ga4PropertyId": row.get("ga4_property_id"),
        "dateRangeDays": int(row.get("google_date_range_days") or 0) or 28,
        "connectedEmail": row.get("google_connected_email"),
        "connectedAt": connected_at,
    }


def apply_property_google_credentials_patch(
    conn: Connection,
    property_id: int,
    *,
    refresh_token: str | None = None,
    auth_mode: str | None = None,
    gsc_site_url: str | None = None,
    ga4_property_id: str | None = None,
    date_range_days: int | None = None,
    connected_email: str | None = None,
    fields_set: frozenset[str] | None = None,
) -> None:
    """Merge Google OAuth / site mapping fields on a property row."""
    allowed = fields_set or frozenset({
        "refresh_token", "auth_mode", "gsc_site_url", "ga4_property_id",
        "date_range_days", "connected_email",
    })
    sets: list[str] = ["updated_at = now()"]
    vals: list[Any] = []

    def _add(col: str, val: Any) -> None:
        sets.append(f"{col} = %s")
        vals.append(val)

    if "gsc_site_url" in allowed and gsc_site_url is not None:
        _add("gsc_site_url", gsc_site_url.strip() or None)
    if "ga4_property_id" in allowed and ga4_property_id is not None:
        v = ga4_property_id.strip() if ga4_property_id else ""
        if v and not v.isdigit():
            raise ValueError(
                "Analytics property ID must be a numeric ID (e.g. 123456789). "
                "The G-XXXXXXX code is a Measurement ID."
            )
        _add("ga4_property_id", v or None)
    if "date_range_days" in allowed and date_range_days is not None and date_range_days > 0:
        _add("google_date_range_days", date_range_days)
    if "auth_mode" in allowed and auth_mode is not None:
        _add("google_auth_mode", auth_mode or None)
    if "connected_email" in allowed and connected_email is not None:
        _add("google_connected_email", connected_email.strip() or None)
    if "refresh_token" in allowed and refresh_token is not None:
        token = refresh_token.strip()
        _add("google_refresh_token", token or None)
        if token:
            sets.append("google_connected_at = now()")
        else:
            sets.append("google_connected_at = NULL")
            if "connected_email" not in allowed or connected_email is None:
                sets.append("google_connected_email = NULL")

    if len(vals) == 0:
        raise ValueError("No valid fields provided")

    vals.append(property_id)
    conn.execute(
        f"UPDATE properties SET {', '.join(sets)} WHERE id = %s",
        vals,
    )
    conn.commit()


def disconnect_property_google(conn: Connection, property_id: int) -> None:
    apply_property_google_credentials_patch(
        conn,
        property_id,
        refresh_token="",
        auth_mode=None,
        fields_set=frozenset({"refresh_token", "auth_mode"}),
    )


def get_property_google_status(conn: Connection, property_id: int) -> dict[str, Any] | None:
    """Property-level Google integration status for the integrations UI."""
    from website_profiling.db.google_app_store import read_google_app_settings
    from website_profiling.integrations.google.store import read_last_google_fetched_at_for_property

    if not get_property_by_id(conn, property_id):
        return None

    prop_status = get_property_google_public_status(conn, property_id)
    app_cfg = read_google_app_settings(conn)
    has_client_id = bool(app_cfg.get("client_id"))

    return {
        **prop_status,
        "hasClientId": has_client_id,
        "lastFetchedAt": read_last_google_fetched_at_for_property(conn, property_id),
        "propertyId": property_id,
    }
