from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class AnalyticsEvent(Base):
    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    site_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    page_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True, index=True)
    referrer: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    country: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    device: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    browser: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    os: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    custom_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_bot: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    bot_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AnalyticsFunnel(Base):
    __tablename__ = "analytics_funnels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    steps: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AnalyticsGoal(Base):
    __tablename__ = "analytics_goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
