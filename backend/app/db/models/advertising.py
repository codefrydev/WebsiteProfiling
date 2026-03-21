from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Float, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class PpcKeyword(Base):
    __tablename__ = "ppc_keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    cpc: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    competition: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    volume: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    trend: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ad_groups: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AdIntelligence(Base):
    __tablename__ = "ad_intelligence"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    ad_copy: Mapped[Optional[str]] = mapped_column(String(4096), nullable=True)
    landing_page: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ad_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    first_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
