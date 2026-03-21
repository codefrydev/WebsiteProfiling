from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Float, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class Keyword(Base):
    __tablename__ = "keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False, unique=True, index=True)
    volume: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    difficulty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    cpc: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    trend_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    clicks_per_search: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    parent_topic: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    search_intent: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class KeywordCluster(Base):
    __tablename__ = "keyword_clusters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    parent_keyword: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    keywords: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    volume_total: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class KeywordList(Base):
    __tablename__ = "keyword_lists"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    keywords: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
