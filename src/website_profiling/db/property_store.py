"""Properties table: per-domain Google OAuth and GSC/GA4 mapping."""
from __future__ import annotations

from typing import Any, Optional
from urllib.parse import urlparse

from psycopg import Connection

from ._common import _row_field


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


def upsert_property_by_domain(
    conn: Connection,
    name: str,
    canonical_domain: str,
    site_url: str | None = None,
) -> int:
    domain = (canonical_domain or "").strip().lower()
    if not domain:
        raise ValueError("canonical_domain is required")
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
    return int(row[0])


def resolve_property_id_from_start_url(conn: Connection, start_url: str) -> int | None:
    domain = canonical_domain_from_start_url(start_url)
    if not domain:
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
        connected_at = row[7]
        crawl_auth = row[10]
        out.append({
            "id": int(row[0]),
            "name": row[1],
            "canonical_domain": row[2],
            "site_url": row[3],
            "gsc_site_url": row[4],
            "ga4_property_id": row[5],
            "google_auth_mode": row[6],
            "google_connected": connected_at is not None,
            "google_connected_at": connected_at.isoformat() if connected_at else None,
            "google_connected_email": row[8],
            "google_date_range_days": row[9],
            "crawl_authorized_at": crawl_auth.isoformat() if crawl_auth else None,
        })
    return out
