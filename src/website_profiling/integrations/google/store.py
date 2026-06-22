"""
Read/write the google_data table.
The table stores the latest Google data snapshot (GSC + GA4).
"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from psycopg import Connection
from psycopg.types.json import Json

from ...db._common import _parse_row_json, _row_field, _sanitize_for_json


def write_google_data(
    conn: Connection,
    data: dict[str, Any],
    property_id: int | None = None,
) -> None:
    """Insert a new google_data row. Older rows are kept (historical)."""
    fetched_at = data.get("fetched_at") or time.strftime("%Y-%m-%d %H:%M:%S")
    conn.execute(
        "INSERT INTO google_data (fetched_at, data, property_id) VALUES (%s, %s, %s)",
        (fetched_at, Json(_sanitize_for_json(data)), property_id),
    )
    conn.commit()


def read_latest_google_data(
    conn: Connection,
    property_id: int | None = None,
) -> Optional[dict[str, Any]]:
    """
    Return the latest google_data row as a dict suitable for report_payload["google"].
    When property_id is set, scope to that property; else global latest (legacy).
    Strips full by_page/by_path from the returned dict (those stay in DB for lookups).
    """
    try:
        if property_id is not None:
            cur = conn.execute(
                """
                SELECT data FROM google_data
                WHERE property_id = %s
                ORDER BY id DESC LIMIT 1
                """,
                (property_id,),
            )
        else:
            cur = conn.execute("SELECT data FROM google_data ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_row_json(row)
        if not isinstance(data, dict):
            return None
        return _to_payload_shape(data)
    except Exception:
        return None


def _to_payload_shape(data: dict[str, Any]) -> dict[str, Any]:
    """Strip gsc_full/ga4_full keys from the payload."""
    return {k: v for k, v in data.items() if k not in ("gsc_full", "ga4_full")}


def read_google_data_full(
    conn: Connection,
    property_id: int | None = None,
) -> Optional[dict[str, Any]]:
    """Return latest google_data row including gsc_full and ga4_full blobs."""
    try:
        if property_id is not None:
            cur = conn.execute(
                """
                SELECT data FROM google_data
                WHERE property_id = %s
                ORDER BY id DESC LIMIT 1
                """,
                (property_id,),
            )
        else:
            cur = conn.execute("SELECT data FROM google_data ORDER BY id DESC LIMIT 1")
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_row_json(row)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def read_prior_google_snapshot(
    conn: Connection,
    property_id: int | None = None,
    *,
    skip: int = 1,
) -> Optional[dict[str, Any]]:
    """Return the Nth-most-recent google_data row (skip=1 → prior snapshot)."""
    try:
        offset = max(0, int(skip))
        if property_id is not None:
            cur = conn.execute(
                """
                SELECT data FROM google_data
                WHERE property_id = %s
                ORDER BY id DESC
                OFFSET %s LIMIT 1
                """,
                (property_id, offset),
            )
        else:
            cur = conn.execute(
                """
                SELECT data FROM google_data
                ORDER BY id DESC
                OFFSET %s LIMIT 1
                """,
                (offset,),
            )
        row = cur.fetchone()
        if row is None:
            return None
        data = _parse_row_json(row)
        return data if isinstance(data, dict) else None
    except Exception:
        return None


def read_last_google_fetched_at(conn: Connection) -> str | None:
    """ISO timestamp of the most recent google_data row (any property)."""
    try:
        cur = conn.execute(
            "SELECT fetched_at FROM google_data ORDER BY id DESC LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            return None
        fetched = _row_field(row, "fetched_at", index=0)
        if fetched is None:
            return None
        return fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched)
    except Exception:
        return None


def read_google_snapshot_row(
    conn: Connection,
    property_id: int,
    *,
    snapshot_id: int | None = None,
) -> dict[str, Any] | None:
    """Return one google_data row as {id, fetchedAt, data} with full parsed blob."""
    try:
        if snapshot_id is not None:
            cur = conn.execute(
                """
                SELECT id, fetched_at, data
                FROM google_data
                WHERE id = %s AND property_id = %s
                """,
                (snapshot_id, property_id),
            )
        else:
            cur = conn.execute(
                """
                SELECT id, fetched_at, data
                FROM google_data
                WHERE property_id = %s
                ORDER BY id DESC
                LIMIT 1
                """,
                (property_id,),
            )
        row = cur.fetchone()
        if not row:
            return None
        data = _parse_row_json(row, "data", index=2)
        if not isinstance(data, dict):
            return None
        fetched = _row_field(row, "fetched_at", index=1)
        return {
            "id": int(_row_field(row, "id", index=0)),
            "fetchedAt": fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched or ""),
            "data": data,
        }
    except Exception:
        return None


def list_google_snapshot_rows(
    conn: Connection,
    property_id: int,
    *,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Recent google_data rows for a property as {id, fetchedAt, data}."""
    limit = max(1, min(int(limit), 50))
    try:
        cur = conn.execute(
            """
            SELECT id, fetched_at, data
            FROM google_data
            WHERE property_id = %s
            ORDER BY id DESC
            LIMIT %s
            """,
            (property_id, limit),
        )
        out: list[dict[str, Any]] = []
        for row in cur.fetchall() or []:
            data = _parse_row_json(row, "data", index=2)
            if not isinstance(data, dict):
                continue
            fetched = _row_field(row, "fetched_at", index=1)
            out.append({
                "id": int(_row_field(row, "id", index=0)),
                "fetchedAt": fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched or ""),
                "data": data,
            })
        return out
    except Exception:
        return []


def read_last_google_fetched_at_for_property(conn: Connection, property_id: int) -> str | None:
    """ISO timestamp of the most recent google_data row for a property."""
    try:
        cur = conn.execute(
            """
            SELECT fetched_at FROM google_data
            WHERE property_id = %s
            ORDER BY id DESC
            LIMIT 1
            """,
            (property_id,),
        )
        row = cur.fetchone()
        if not row:
            return None
        fetched = _row_field(row, "fetched_at", index=0)
        if fetched is None:
            return None
        return fetched.isoformat() if hasattr(fetched, "isoformat") else str(fetched)
    except Exception:
        return None


def gsc_row_deltas(
    current_rows: list[dict[str, Any]],
    prior_rows: list[dict[str, Any]],
    *,
    key_field: str,
) -> list[dict[str, Any]]:
    """Compute click/impression/position deltas keyed by page or query field."""
    prior_by_key: dict[str, dict[str, Any]] = {}
    for row in prior_rows:
        if not isinstance(row, dict):
            continue
        key = str(row.get(key_field) or "").strip().lower()
        if key:
            prior_by_key[key] = row

    deltas: list[dict[str, Any]] = []
    for row in current_rows:
        if not isinstance(row, dict):
            continue
        key = str(row.get(key_field) or "").strip().lower()
        if not key:
            continue
        prior = prior_by_key.get(key) or {}
        cur_clicks = float(row.get("clicks") or 0)
        pri_clicks = float(prior.get("clicks") or 0)
        cur_impr = float(row.get("impressions") or 0)
        pri_impr = float(prior.get("impressions") or 0)
        cur_pos = float(row.get("position") or row.get("avg_position") or 0)
        pri_pos = float(prior.get("position") or prior.get("avg_position") or 0)
        out = dict(row)
        out["clicks_delta"] = cur_clicks - pri_clicks
        out["impressions_delta"] = cur_impr - pri_impr
        out["position_delta"] = cur_pos - pri_pos if pri_pos else None
        deltas.append(out)
    return deltas
