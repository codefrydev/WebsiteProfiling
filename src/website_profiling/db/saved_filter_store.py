"""Saved crawl filters (saved_crawl_filters table)."""
from __future__ import annotations

from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ._common import _row_field


def _map_filter_row(row: Any) -> dict[str, Any]:
    created = _row_field(row, "created_at")
    return {
        "id": _row_field(row, "id"),
        "propertyId": _row_field(row, "property_id"),
        "name": _row_field(row, "name"),
        "filterJson": _row_field(row, "filter_json") or {},
        "createdAt": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
    }


def list_saved_filters(conn: Connection, property_id: int) -> list[dict[str, Any]]:
    cur = conn.execute(
        """
        SELECT id, property_id, name, filter_json, created_at
        FROM saved_crawl_filters
        WHERE property_id = %s
        ORDER BY name
        """,
        (property_id,),
    )
    return [_map_filter_row(row) for row in cur.fetchall() or []]


def upsert_saved_filter(
    conn: Connection,
    property_id: int,
    name: str,
    filter_json: dict[str, Any],
) -> None:
    conn.execute(
        """
        INSERT INTO saved_crawl_filters (property_id, name, filter_json)
        VALUES (%s, %s, %s)
        ON CONFLICT (property_id, name) DO UPDATE SET filter_json = EXCLUDED.filter_json
        """,
        (property_id, name, Json(filter_json)),
    )
    conn.commit()


def delete_saved_filter(conn: Connection, property_id: int, name: str) -> None:
    conn.execute(
        "DELETE FROM saved_crawl_filters WHERE property_id = %s AND name = %s",
        (property_id, name),
    )
    conn.commit()
