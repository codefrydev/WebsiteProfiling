"""Chat session and message persistence for in-app AI chat."""
from __future__ import annotations

import json
from typing import Any, Optional

from psycopg import Connection
from psycopg.types.json import Json

from ._common import _row_field


def create_session(
    conn: Connection,
    property_id: int,
    title: str = "New chat",
) -> int:
    cur = conn.execute(
        """INSERT INTO chat_sessions (property_id, title, created_at, updated_at)
           VALUES (%s, %s, now(), now()) RETURNING id""",
        (property_id, title.strip() or "New chat"),
    )
    row = cur.fetchone()
    conn.commit()
    rid = _row_field(row, "id", index=0)
    return int(rid) if rid is not None else 0


def list_sessions(conn: Connection, property_id: int, limit: int = 30) -> list[dict[str, Any]]:
    cur = conn.execute(
        """SELECT id, property_id, title, created_at, updated_at
           FROM chat_sessions
           WHERE property_id = %s
           ORDER BY updated_at DESC
           LIMIT %s""",
        (property_id, max(1, min(limit, 100))),
    )
    out: list[dict[str, Any]] = []
    for row in cur.fetchall() or []:
        created = _row_field(row, "created_at", index=3)
        updated = _row_field(row, "updated_at", index=4)
        out.append({
            "id": int(_row_field(row, "id", index=0)),
            "property_id": int(_row_field(row, "property_id", index=1)),
            "title": _row_field(row, "title", index=2),
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
            "updated_at": updated.isoformat() if hasattr(updated, "isoformat") else str(updated or ""),
        })
    return out


def get_session(conn: Connection, session_id: int) -> dict[str, Any] | None:
    cur = conn.execute(
        """SELECT id, property_id, title, created_at, updated_at
           FROM chat_sessions WHERE id = %s""",
        (session_id,),
    )
    row = cur.fetchone()
    if not row:
        return None
    created = _row_field(row, "created_at", index=3)
    updated = _row_field(row, "updated_at", index=4)
    return {
        "id": int(_row_field(row, "id", index=0)),
        "property_id": int(_row_field(row, "property_id", index=1)),
        "title": _row_field(row, "title", index=2),
        "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
        "updated_at": updated.isoformat() if hasattr(updated, "isoformat") else str(updated or ""),
    }


def delete_session(conn: Connection, session_id: int) -> bool:
    cur = conn.execute("DELETE FROM chat_sessions WHERE id = %s RETURNING id", (session_id,))
    row = cur.fetchone()
    conn.commit()
    return row is not None


def get_messages(conn: Connection, session_id: int, limit: int = 200) -> list[dict[str, Any]]:
    cur = conn.execute(
        """SELECT id, role, content, tool_name, tool_args, tool_result, created_at
           FROM chat_messages
           WHERE session_id = %s
           ORDER BY created_at ASC
           LIMIT %s""",
        (session_id, max(1, min(limit, 500))),
    )
    out: list[dict[str, Any]] = []
    for row in cur.fetchall() or []:
        created = _row_field(row, "created_at", index=6)
        tool_args = _row_field(row, "tool_args", index=4)
        tool_result = _row_field(row, "tool_result", index=5)
        if isinstance(tool_args, str):
            try:
                tool_args = json.loads(tool_args)
            except json.JSONDecodeError:
                pass
        if isinstance(tool_result, str):
            try:
                tool_result = json.loads(tool_result)
            except json.JSONDecodeError:
                pass
        out.append({
            "id": int(_row_field(row, "id", index=0)),
            "role": _row_field(row, "role", index=1),
            "content": _row_field(row, "content", index=2) or "",
            "tool_name": _row_field(row, "tool_name", index=3),
            "tool_args": tool_args,
            "tool_result": tool_result,
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
        })
    return out


def append_message(
    conn: Connection,
    session_id: int,
    role: str,
    content: str = "",
    *,
    tool_name: Optional[str] = None,
    tool_args: Optional[dict[str, Any]] = None,
    tool_result: Optional[dict[str, Any]] = None,
) -> int:
    cur = conn.execute(
        """INSERT INTO chat_messages
             (session_id, role, content, tool_name, tool_args, tool_result, created_at)
           VALUES (%s, %s, %s, %s, %s, %s, now()) RETURNING id""",
        (
            session_id,
            role,
            content,
            tool_name,
            Json(tool_args) if tool_args is not None else None,
            Json(tool_result) if tool_result is not None else None,
        ),
    )
    row = cur.fetchone()
    touch_session(conn, session_id)
    conn.commit()
    rid = _row_field(row, "id", index=0)
    return int(rid) if rid is not None else 0


def update_session_title(conn: Connection, session_id: int, title: str) -> None:
    conn.execute(
        "UPDATE chat_sessions SET title = %s, updated_at = now() WHERE id = %s",
        (title.strip() or "New chat", session_id),
    )
    conn.commit()


def touch_session(conn: Connection, session_id: int) -> None:
    conn.execute(
        "UPDATE chat_sessions SET updated_at = now() WHERE id = %s",
        (session_id,),
    )
