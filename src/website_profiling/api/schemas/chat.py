"""Chat request/response Pydantic schemas."""
from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    sessionId: int
    propertyId: int
    message: str
    reportId: Optional[int] = None


class ChatSessionCreate(BaseModel):
    propertyId: int
    title: str = "New chat"


class ChatSessionResponse(BaseModel):
    id: int
    propertyId: int
    title: str
    createdAt: str
    updatedAt: str


class ChatMessageResponse(BaseModel):
    id: int
    role: str
    content: str
    tool_name: Optional[str] = None
    tool_args: Optional[dict[str, Any]] = None
    tool_result: Optional[dict[str, Any]] = None
    created_at: str


class ArtifactUpdateBody(BaseModel):
    title: Optional[str] = None
    pinned: Optional[bool] = None
