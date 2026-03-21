from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Float, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class ContentItem(Base):
    __tablename__ = "content_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False, index=True)
    title: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    word_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    traffic_est: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    referring_domains_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    social_shares: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    indexed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ContentScore(Base):
    __tablename__ = "content_scores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    keyword: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    recommendations: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class ContentInventory(Base):
    __tablename__ = "content_inventory"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    title: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    word_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_updated: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    traffic_trend: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    author: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class TopicResearch(Base):
    __tablename__ = "topic_research"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    seed_keyword: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    topics: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    questions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    trends: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
