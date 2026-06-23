"""Read/write per-property competitor keyword gap rows."""
from __future__ import annotations

from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ...db.storage import _parse_row_json, _sanitize_for_json


def _normalize_competitor(value: str) -> str:
    return str(value or "").strip().lower()


def read_competitor_keyword_gap(conn: Connection, property_id: int | None) -> list[dict[str, Any]]:
    """Return stored competitor keyword gap rows for property_id."""
    if property_id is None:
        return []
    try:
        cur = conn.execute(
            "SELECT data FROM competitor_keyword_gap WHERE property_id = %s",
            (property_id,),
        )
        row = cur.fetchone()
        if row is None:
            return []
        data = _parse_row_json(row)
        if isinstance(data, list):
            return [r for r in data if isinstance(r, dict)]
        return []
    except Exception:
        return []


def write_competitor_keyword_gap(
    conn: Connection,
    property_id: int,
    rows: list[dict[str, Any]],
) -> None:
    """Replace all competitor keyword gap rows for property_id."""
    conn.execute(
        """
        INSERT INTO competitor_keyword_gap (property_id, data, updated_at)
        VALUES (%s, %s, now())
        ON CONFLICT (property_id) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = now()
        """,
        (property_id, Json(_sanitize_for_json(rows))),
    )
    conn.commit()


def merge_competitor_keyword_import(
    conn: Connection,
    property_id: int,
    competitor: str,
    new_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Replace rows for competitor (case-insensitive), keep other competitors, upsert."""
    competitor_norm = _normalize_competitor(competitor)
    existing = read_competitor_keyword_gap(conn, property_id)
    kept = [
        r
        for r in existing
        if _normalize_competitor(str(r.get("competitor") or "")) != competitor_norm
    ]
    merged = kept + [r for r in new_rows if isinstance(r, dict)]
    write_competitor_keyword_gap(conn, property_id, merged)
    return merged
