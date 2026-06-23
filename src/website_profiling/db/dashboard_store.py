"""Custom dashboards (dashboards table)."""
from __future__ import annotations

from typing import Any

from psycopg import Connection
from psycopg.types.json import Json

from ._common import _row_field

_SELECT = """
    SELECT id, property_id, name, layout_json, is_default, created_at, updated_at
    FROM dashboards
"""


def _map_dashboard(row: Any) -> dict[str, Any]:
    created = _row_field(row, "created_at", index=5)
    updated = _row_field(row, "updated_at", index=6)
    layout = _row_field(row, "layout_json", index=3) or {}
    return {
        "id": int(_row_field(row, "id", index=0)),
        "propertyId": int(_row_field(row, "property_id", index=1)),
        "name": _row_field(row, "name", index=2),
        "layoutJson": layout,
        "isDefault": bool(_row_field(row, "is_default", index=4)),
        "createdAt": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
        "updatedAt": updated.isoformat() if hasattr(updated, "isoformat") else str(updated or ""),
    }


def list_dashboards(conn: Connection, property_id: int) -> list[dict[str, Any]]:
    cur = conn.execute(
        f"{_SELECT} WHERE property_id = %s ORDER BY updated_at DESC",
        (property_id,),
    )
    return [_map_dashboard(row) for row in cur.fetchall() or []]


def get_dashboard(conn: Connection, dashboard_id: int, property_id: int) -> dict[str, Any] | None:
    cur = conn.execute(
        f"{_SELECT} WHERE id = %s AND property_id = %s",
        (dashboard_id, property_id),
    )
    row = cur.fetchone()
    return _map_dashboard(row) if row else None


def create_dashboard(
    conn: Connection,
    property_id: int,
    name: str,
    layout_json: Any,
) -> dict[str, Any]:
    cur = conn.execute(
        """
        INSERT INTO dashboards (property_id, name, layout_json)
        VALUES (%s, %s, %s)
        RETURNING id, property_id, name, layout_json, is_default, created_at, updated_at
        """,
        (property_id, name, Json(layout_json)),
    )
    row = cur.fetchone()
    conn.commit()
    return _map_dashboard(row)


def update_dashboard(
    conn: Connection,
    dashboard_id: int,
    property_id: int,
    *,
    name: str | None = None,
    layout_json: Any | None = None,
    is_default: bool | None = None,
) -> dict[str, Any] | None:
    sets = ["updated_at = now()"]
    vals: list[Any] = []

    if name is not None:
        sets.append("name = %s")
        vals.append(name.strip() or "Untitled dashboard")
    if layout_json is not None:
        sets.append("layout_json = %s")
        vals.append(Json(layout_json))
    if is_default is not None:
        if is_default:
            conn.execute(
                "UPDATE dashboards SET is_default = false WHERE property_id = %s",
                (property_id,),
            )
        sets.append("is_default = %s")
        vals.append(is_default)

    vals.extend([dashboard_id, property_id])
    cur = conn.execute(
        f"""
        UPDATE dashboards SET {', '.join(sets)}
        WHERE id = %s AND property_id = %s
        RETURNING id, property_id, name, layout_json, is_default, created_at, updated_at
        """,
        vals,
    )
    row = cur.fetchone()
    conn.commit()
    return _map_dashboard(row) if row else None


def delete_dashboard(conn: Connection, dashboard_id: int, property_id: int) -> bool:
    cur = conn.execute(
        "DELETE FROM dashboards WHERE id = %s AND property_id = %s RETURNING id",
        (dashboard_id, property_id),
    )
    deleted = cur.fetchone() is not None
    conn.commit()
    return deleted
