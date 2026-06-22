"""Chat routers — /api/chat, /api/chat/sessions/*, /api/chat/artifacts/*."""
from __future__ import annotations

import json
import queue
import re
import threading
from typing import Annotated, Any, Generator, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from psycopg import Connection

from ..deps import get_db
from ..schemas.chat import ArtifactUpdateBody, ChatRequest, ChatSessionCreate

router = APIRouter(prefix="/chat", tags=["chat"])

DbDep = Annotated[Connection, Depends(get_db)]

_FIRST_SENTENCE_RE = re.compile(r"^(.{8,80}[.!?])", re.DOTALL)


def _messages_for_agent_context(
    rows: list[dict[str, Any]], max_turns: int = 20
) -> list[dict[str, str]]:
    """Port of messagesForAgentContext from chatDb.ts."""
    relevant = [m for m in rows if m.get("role") in ("user", "assistant")]
    sliced = relevant[-(max_turns * 2):]
    return [{"role": m["role"], "content": str(m.get("content") or "")} for m in sliced]


def _derive_title(text: str) -> str | None:
    text = text.strip()
    if not text:
        return None
    m = _FIRST_SENTENCE_RE.match(text)
    raw = m.group(1).strip() if m else text[:60].strip()
    return raw[:80] if raw else None


# ── POST /api/chat (SSE streaming) ────────────────────────────────────────────

@router.post("/")
def chat_turn(body: ChatRequest, conn: DbDep) -> StreamingResponse:
    from website_profiling.db.chat_store import (
        append_message,
        get_messages,
        get_session,
        update_session_title,
    )
    from website_profiling.llm.agent import run_agent_turn
    from website_profiling.tools.audit_tools import AuditToolContext

    # Validate session
    session = get_session(conn, body.sessionId)
    if not session or session["property_id"] != body.propertyId:
        raise HTTPException(status_code=404, detail="session not found")

    # Persist user message
    append_message(conn, body.sessionId, "user", body.message)

    # Build agent context
    history = get_messages(conn, body.sessionId)
    agent_messages = _messages_for_agent_context(history)
    context = AuditToolContext(
        property_id=body.propertyId,
        report_id=body.reportId,
    )

    q: queue.Queue[dict[str, Any] | None] = queue.Queue()
    assistant_parts: list[str] = []
    tool_events: list[dict[str, Any]] = []
    result_holder: list[dict[str, Any]] = []

    def on_event(event: dict[str, Any]) -> None:
        if event.get("type") == "token":
            assistant_parts.append(str(event.get("text") or ""))
        elif event.get("type") == "tool_end":
            tool_events.append(event)
        q.put(event)

    def run_agent() -> None:
        try:
            result = run_agent_turn(agent_messages, context, on_event=on_event)
            result_holder.append(result)
        except Exception as exc:
            q.put({"type": "error", "message": str(exc)})
        finally:
            q.put(None)  # sentinel

    thread = threading.Thread(target=run_agent, daemon=True)
    thread.start()

    def generate() -> Generator[str, None, None]:
        while True:
            item = q.get()
            if item is None:
                break
            event_type = str(item.get("type") or "message")
            yield f"event: {event_type}\ndata: {json.dumps(item)}\n\n"

        thread.join(timeout=5)

        # Persist assistant response
        assistant_text = "".join(assistant_parts).strip()
        if assistant_text:
            try:
                append_message(conn, body.sessionId, "assistant", assistant_text)
                # Auto-title from first user message if session title is default
                if session.get("title") in ("New chat", "", None):
                    derived = _derive_title(body.message) or _derive_title(assistant_text)
                    if derived:
                        update_session_title(conn, body.sessionId, derived)
            except Exception:
                pass

    return StreamingResponse(generate(), media_type="text/event-stream")


# ── Session CRUD ──────────────────────────────────────────────────────────────

@router.get("/sessions")
def list_sessions(
    conn: DbDep,
    propertyId: int = Query(...),
) -> dict[str, Any]:
    from website_profiling.db.chat_store import list_sessions as _list

    if not propertyId:
        raise HTTPException(status_code=400, detail="propertyId required")
    sessions = _list(conn, propertyId)
    return {"sessions": sessions}


@router.post("/sessions")
def create_session(body: ChatSessionCreate, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.chat_store import create_session as _create

    if not body.propertyId:
        raise HTTPException(status_code=400, detail="propertyId required")
    session_id = _create(conn, body.propertyId, body.title)
    return {"id": session_id, "propertyId": body.propertyId, "title": body.title}


@router.get("/sessions/{session_id}")
def get_session_route(session_id: int, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.chat_store import get_session

    session = get_session(conn, session_id)
    if not session:
        raise HTTPException(status_code=404, detail="session not found")
    return {"session": session}


@router.delete("/sessions/{session_id}")
def delete_session_route(
    session_id: int,
    conn: DbDep,
    propertyId: int = Query(...),
) -> dict[str, Any]:
    from website_profiling.db.chat_store import delete_session, get_session

    session = get_session(conn, session_id)
    if not session or session["property_id"] != propertyId:
        raise HTTPException(status_code=404, detail="session not found")
    deleted = delete_session(conn, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="session not found")
    return {"ok": True}


@router.get("/sessions/{session_id}/messages")
def get_session_messages(
    session_id: int,
    conn: DbDep,
    propertyId: int = Query(...),
) -> dict[str, Any]:
    from website_profiling.db.chat_store import get_messages, get_session

    session = get_session(conn, session_id)
    if not session or session["property_id"] != propertyId:
        raise HTTPException(status_code=404, detail="session not found")
    messages = get_messages(conn, session_id)
    return {"messages": messages}


# ── Artifacts ────────────────────────────────────────────────────────────────

@router.get("/artifacts/{artifact_id}")
def get_artifact(artifact_id: str) -> Any:
    import base64
    import re as _re

    if not _re.match(r"^[a-f0-9\-]{36}$", artifact_id):
        raise HTTPException(status_code=400, detail="Invalid artifact id")

    try:
        from website_profiling.tools.export_artifacts import read_artifact_bytes

        result = read_artifact_bytes(artifact_id)
    except ImportError:
        raise HTTPException(status_code=500, detail="Artifact module unavailable")

    if not result:
        raise HTTPException(status_code=404, detail="Artifact not found")

    meta, data = result
    filename = meta.get("filename") or "export.bin"
    mime_type = meta.get("mime_type") or "application/octet-stream"
    ascii_name = re.sub(r'[^\x20-\x7e]', '_', filename)
    ascii_name = re.sub(r'["\\/]', '_', ascii_name) or "export.bin"

    from fastapi import Response

    return Response(
        content=data,
        media_type=mime_type,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_name}"; '
                f"filename*=UTF-8''{ascii_name}"
            ),
        },
    )
