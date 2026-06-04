"""Read/write page_google_snapshots (per-URL live fetch history)."""
from __future__ import annotations

import os
from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ...db.storage import _parse_row_json, _sanitize_for_json
from .normalize import normalize_url
from .page_lookup import _public_ga4_page, _public_gsc_page, summary_from_slice


def max_snapshots_per_url() -> int:
    raw = os.environ.get("PAGE_SNAPSHOT_MAX_PER_URL", "30").strip()
    try:
        n = int(raw)
        return max(1, min(n, 200))
    except ValueError:
        return 30


def write_page_snapshot(conn: Connection, page_url: str, data: dict[str, Any]) -> int:
    """Insert live snapshot and prune older rows for the same normalized URL."""
    url_norm = normalize_url(page_url)
    cur = conn.execute(
        """
        INSERT INTO page_google_snapshots (page_url, url_norm, data)
        VALUES (%s, %s, %s)
        RETURNING id
        """,
        (page_url.strip(), url_norm, Json(_sanitize_for_json(data))),
    )
    row = cur.fetchone()
    snapshot_id = int(row["id"]) if row else 0
    limit = max_snapshots_per_url()
    conn.execute(
        """
        DELETE FROM page_google_snapshots
        WHERE url_norm = %s
          AND id NOT IN (
            SELECT id FROM page_google_snapshots
            WHERE url_norm = %s
            ORDER BY fetched_at DESC, id DESC
            LIMIT %s
          )
        """,
        (url_norm, url_norm, limit),
    )
    conn.commit()
    return snapshot_id


def read_page_snapshot(conn: Connection, snapshot_id: int) -> dict[str, Any] | None:
    cur = conn.execute(
        "SELECT id, page_url, url_norm, fetched_at, data FROM page_google_snapshots WHERE id = %s",
        (snapshot_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    data = _parse_row_json(row) or {}
    return {
        "snapshotId": int(row["id"]),
        "pageUrl": str(row["page_url"]),
        "urlNorm": str(row["url_norm"]),
        "fetchedAt": row["fetched_at"].isoformat() if row["fetched_at"] else None,
        "source": data.get("source") or "live",
        "gsc": data.get("gsc"),
        "ga4": data.get("ga4"),
        "dateRange": data.get("date_range") or data.get("dateRange"),
        "errors": data.get("errors") or [],
    }


def list_live_history(
    conn: Connection, page_url: str, *, limit: int = 15
) -> list[dict[str, Any]]:
    url_norm = normalize_url(page_url)
    cur = conn.execute(
        """
        SELECT id, fetched_at, data
        FROM page_google_snapshots
        WHERE url_norm = %s
        ORDER BY fetched_at DESC, id DESC
        LIMIT %s
        """,
        (url_norm, limit),
    )
    out: list[dict[str, Any]] = []
    for row in cur.fetchall():
        data = _parse_row_json(row) or {}
        gsc = data.get("gsc")
        ga4 = data.get("ga4")
        out.append(
            {
                "id": int(row["id"]),
                "fetchedAt": row["fetched_at"].isoformat() if row["fetched_at"] else None,
                "type": "live",
                **summary_from_slice(gsc, ga4),
            }
        )
    return out


def latest_live_snapshot(conn: Connection, page_url: str) -> dict[str, Any] | None:
    rows = list_live_history(conn, page_url, limit=1)
    if not rows:
        return None
    return read_page_snapshot(conn, int(rows[0]["id"]))


def package_live_payload(
    page_url: str,
    gsc: dict[str, Any] | None,
    ga4: dict[str, Any] | None,
    *,
    date_range: dict[str, str],
    errors: list[str],
) -> dict[str, Any]:
    return {
        "source": "live",
        "page_url": page_url,
        "gsc": _public_gsc_page(gsc) if gsc else _public_gsc_page(None),
        "ga4": _public_ga4_page(ga4) if ga4 else _public_ga4_page(None),
        "date_range": date_range,
        "errors": errors,
    }
