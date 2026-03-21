from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Boolean, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class BrandMention(Base):
    __tablename__ = "brand_mentions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    brand_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    context_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sentiment: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    mention_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_linked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AiCitation(Base):
    __tablename__ = "ai_citations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    brand_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    llm_platform: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    brand_mentioned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    url_cited: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sentiment: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    response_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
