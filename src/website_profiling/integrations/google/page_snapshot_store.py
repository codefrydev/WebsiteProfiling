"""Read/write page_google_snapshots (per-URL live fetch history)."""
from __future__ import annotations

import os
from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ...db._common import _parse_row_json, _row_field, _sanitize_for_json
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
    snapshot_id = int(_row_field(row, "id", index=0)) if row else 0
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
    data = _parse_row_json(row, "data", index=4) or {}
    fetched = _row_field(row, "fetched_at", index=3)
    return {
        "snapshotId": int(_row_field(row, "id", index=0)),
        "pageUrl": str(_row_field(row, "page_url", index=1)),
        "urlNorm": str(_row_field(row, "url_norm", index=2)),
        "fetchedAt": fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched or ""),
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
        data = _parse_row_json(row, "data", index=2) or {}
        gsc = data.get("gsc")
        ga4 = data.get("ga4")
        fetched = _row_field(row, "fetched_at", index=1)
        out.append(
            {
                "id": int(_row_field(row, "id", index=0)),
                "fetchedAt": fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched or ""),
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


def read_page_snapshot_compare(conn: Connection, snapshot_id: int) -> dict[str, Any] | None:
    """Load snapshot for page-compare API ({id, fetchedAt, data})."""
    cur = conn.execute(
        "SELECT id, fetched_at, data FROM page_google_snapshots WHERE id = %s",
        (snapshot_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    data = _parse_row_json(row, "data", index=2)
    if not isinstance(data, dict):
        data = {}
    fetched = _row_field(row, "fetched_at", index=1)
    return {
        "id": int(_row_field(row, "id", index=0)),
        "fetchedAt": fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched or ""),
        "data": data,
    }


def list_page_snapshot_api_history(
    conn: Connection,
    page_url: str,
    *,
    limit: int = 15,
) -> list[dict[str, Any]]:
    """History rows with raw gsc/ga4 blobs for the integrations API."""
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
    for row in cur.fetchall() or []:
        data = _parse_row_json(row, "data", index=2) or {}
        if not isinstance(data, dict):
            data = {}
        fetched = _row_field(row, "fetched_at", index=1)
        out.append({
            "id": int(_row_field(row, "id", index=0)),
            "fetchedAt": fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched or ""),
            "gsc": data.get("gsc"),
            "ga4": data.get("ga4"),
        })
    return out


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
