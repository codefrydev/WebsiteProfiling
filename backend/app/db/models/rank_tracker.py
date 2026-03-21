from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Date, Float, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class TrackedKeyword(Base):
    __tablename__ = "tracked_keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False)
    location: Mapped[str] = mapped_column(String(100), default="United States", nullable=False)
    device: Mapped[str] = mapped_column(String(20), default="desktop", nullable=False)
    language: Mapped[str] = mapped_column(String(10), default="en", nullable=False)
    tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    history: Mapped[list["RankHistory"]] = relationship("RankHistory", back_populates="tracked_keyword", lazy="selectin")


class RankHistory(Base):
    __tablename__ = "rank_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    tracked_keyword_id: Mapped[int] = mapped_column(Integer, ForeignKey("tracked_keywords.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    previous_position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    serp_features: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    visibility_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    tracked_keyword: Mapped["TrackedKeyword"] = relationship("TrackedKeyword", back_populates="history", lazy="selectin")


class SerpSnapshot(Base):
    __tablename__ = "serp_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(100), nullable=False)
    device: Mapped[str] = mapped_column(String(20), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    results: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    features: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
