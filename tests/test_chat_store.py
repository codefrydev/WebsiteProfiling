"""Unit tests for chat_store."""
from __future__ import annotations

from datetime import datetime, timezone

from tests.db_test_fakes import FakeConn, FakeCursor

from website_profiling.db.chat_store import (
    append_message,
    create_session,
    delete_session,
    get_messages,
    get_session,
    list_sessions,
    update_session_title,
)


def test_create_session_returns_id() -> None:
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"id": 42}))
    sid = create_session(conn, 7, "Test chat")
    assert sid == 42
    assert conn.commits == 1


def test_list_sessions() -> None:
    conn = FakeConn()
    now = datetime.now(timezone.utc)
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {"id": 1, "property_id": 7, "title": "Chat A", "created_at": now, "updated_at": now},
            ],
        ),
    )
    rows = list_sessions(conn, 7)
    assert len(rows) == 1
    assert rows[0]["title"] == "Chat A"
    assert rows[0]["property_id"] == 7


def test_get_session_missing() -> None:
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    assert get_session(conn, 99) is None


def test_get_messages() -> None:
    conn = FakeConn()
    now = datetime.now(timezone.utc)
    conn.set_next_cursor(
        FakeCursor(
            fetchall_value=[
                {
                    "id": 1,
                    "role": "user",
                    "content": "Hello",
                    "tool_name": None,
                    "tool_args": None,
                    "tool_result": None,
                    "created_at": now,
                },
            ],
        ),
    )
    msgs = get_messages(conn, 5)
    assert msgs[0]["content"] == "Hello"
    assert msgs[0]["role"] == "user"


def test_append_message_and_touch() -> None:
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"id": 10}))
    mid = append_message(conn, 3, "user", "Hi there")
    assert mid == 10
    assert conn.commits == 1
    touch_sql = [sql for sql, _ in conn.executed if "UPDATE chat_sessions" in sql]
    assert touch_sql


def test_update_session_title() -> None:
    conn = FakeConn()
    update_session_title(conn, 3, "Renamed")
    assert conn.commits == 1


def test_delete_session() -> None:
    conn = FakeConn()
    conn.set_next_cursor(FakeCursor(fetchone_value={"id": 3}))
    assert delete_session(conn, 3) is True
    conn.set_next_cursor(FakeCursor(fetchone_value=None))
    assert delete_session(conn, 99) is False
