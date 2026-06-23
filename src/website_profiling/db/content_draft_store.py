"""Content drafts for Content Studio (content_drafts table)."""
from __future__ import annotations

from typing import Any, Optional

from psycopg import Connection
from psycopg.types.json import Json

from ._common import _parse_row_json, _row_field

_LIST_COLUMNS = """
    id, property_id, title, target_keyword, landing_url, status,
    grade_score, created_at::text, updated_at::text
"""

_DETAIL_COLUMNS = """
    id, property_id, title, target_keyword, landing_url, status,
    body_html, title_tag, meta_description, grade_score, grade_snapshot,
    created_at::text, updated_at::text
"""


def _grade_score_value(raw: Any) -> float | None:
    if raw is None:
        return None
    return float(raw)


def _map_list_row(row: Any) -> dict[str, Any]:
    return {
        "id": int(_row_field(row, "id")),
        "property_id": int(_row_field(row, "property_id")),
        "title": _row_field(row, "title"),
        "target_keyword": _row_field(row, "target_keyword"),
        "landing_url": _row_field(row, "landing_url"),
        "status": _row_field(row, "status"),
        "grade_score": _grade_score_value(_row_field(row, "grade_score")),
        "created_at": _row_field(row, "created_at"),
        "updated_at": _row_field(row, "updated_at"),
    }


def _map_detail_row(row: Any) -> dict[str, Any]:
    return {
        "id": int(_row_field(row, "id")),
        "property_id": int(_row_field(row, "property_id")),
        "title": _row_field(row, "title"),
        "target_keyword": _row_field(row, "target_keyword"),
        "landing_url": _row_field(row, "landing_url"),
        "status": _row_field(row, "status"),
        "body_html": _row_field(row, "body_html") or "",
        "title_tag": _row_field(row, "title_tag") or "",
        "meta_description": _row_field(row, "meta_description") or "",
        "grade_score": _grade_score_value(_row_field(row, "grade_score")),
        "grade_snapshot": _parse_row_json(row, "grade_snapshot"),
        "created_at": _row_field(row, "created_at"),
        "updated_at": _row_field(row, "updated_at"),
    }


def list_content_drafts(
    conn: Connection,
    property_id: int,
    *,
    limit: int = 100,
) -> list[dict[str, Any]]:
    limit = max(1, min(int(limit), 200))
    cur = conn.execute(
        f"""SELECT {_LIST_COLUMNS}
            FROM content_drafts
            WHERE property_id = %s
            ORDER BY updated_at DESC
            LIMIT %s""",
        (property_id, limit),
    )
    return [_map_list_row(row) for row in cur.fetchall() or []]


def get_content_draft(conn: Connection, draft_id: int) -> dict[str, Any] | None:
    cur = conn.execute(
        f"SELECT {_DETAIL_COLUMNS} FROM content_drafts WHERE id = %s",
        (draft_id,),
    )
    row = cur.fetchone()
    return _map_detail_row(row) if row else None


def create_content_draft(
    conn: Connection,
    property_id: int,
    *,
    title: str = "Untitled draft",
    target_keyword: str = "",
    landing_url: str | None = None,
    status: str = "draft",
    body_html: str = "",
    title_tag: str = "",
    meta_description: str = "",
) -> int:
    cur = conn.execute(
        """INSERT INTO content_drafts
             (property_id, title, target_keyword, landing_url, status,
              body_html, title_tag, meta_description)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
           RETURNING id""",
        (
            property_id,
            (title or "Untitled draft").strip() or "Untitled draft",
            (target_keyword or "").strip(),
            (landing_url or "").strip() or None,
            status or "draft",
            body_html or "",
            title_tag or "",
            meta_description or "",
        ),
    )
    row = cur.fetchone()
    conn.commit()
    return int(_row_field(row, "id"))


def update_content_draft(
    conn: Connection,
    draft_id: int,
    patch: dict[str, Any],
) -> dict[str, Any] | None:
    fields: list[str] = []
    values: list[Any] = []

    def set_field(col: str, val: Any) -> None:
        fields.append(f"{col} = %s")
        values.append(val)

    if "title" in patch:
        set_field("title", (str(patch["title"]).strip() or "Untitled draft"))
    if "target_keyword" in patch:
        set_field("target_keyword", str(patch["target_keyword"]).strip())
    if "landing_url" in patch:
        set_field("landing_url", str(patch["landing_url"]).strip() or None)
    if "status" in patch:
        set_field("status", patch["status"])
    if "body_html" in patch:
        set_field("body_html", patch["body_html"])
    if "title_tag" in patch:
        set_field("title_tag", patch["title_tag"])
    if "meta_description" in patch:
        set_field("meta_description", patch["meta_description"])
    if "grade_score" in patch:
        set_field("grade_score", patch["grade_score"])
    if "grade_snapshot" in patch:
        gs = patch["grade_snapshot"]
        set_field("grade_snapshot", Json(gs) if gs is not None else None)

    if not fields:
        return get_content_draft(conn, draft_id)

    fields.append("updated_at = now()")
    values.append(draft_id)
    cur = conn.execute(
        f"""UPDATE content_drafts SET {', '.join(fields)}
            WHERE id = %s
            RETURNING {_DETAIL_COLUMNS}""",
        values,
    )
    row = cur.fetchone()
    conn.commit()
    return _map_detail_row(row) if row else None


def delete_content_draft(conn: Connection, draft_id: int) -> bool:
    cur = conn.execute(
        "DELETE FROM content_drafts WHERE id = %s RETURNING id",
        (draft_id,),
    )
    deleted = cur.fetchone() is not None
    conn.commit()
    return deleted
