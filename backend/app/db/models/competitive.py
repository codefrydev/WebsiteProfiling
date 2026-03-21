from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Date, Float, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class DomainTraffic(Base):
    __tablename__ = "domain_traffic"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    visits_est: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    unique_visitors_est: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    pages_per_visit: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    bounce_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    avg_duration: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    traffic_sources: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    geo_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class MarketSegment(Base):
    __tablename__ = "market_segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    domains: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    metrics: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class BatchAnalysisJob(Base):
    __tablename__ = "batch_analysis_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    urls: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending", nullable=False)
    results: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
