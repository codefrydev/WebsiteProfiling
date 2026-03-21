from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Date, Float, Boolean, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class GscProperty(Base):
    __tablename__ = "gsc_properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    site_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    verified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    access_token: Mapped[Optional[str]] = mapped_column(String(4096), nullable=True)
    refresh_token: Mapped[Optional[str]] = mapped_column(String(4096), nullable=True)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    gsc_data: Mapped[list["GscData"]] = relationship("GscData", back_populates="property", lazy="selectin")


class GscData(Base):
    __tablename__ = "gsc_data"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    property_id: Mapped[int] = mapped_column(Integer, ForeignKey("gsc_properties.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    query: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, index=True)
    page: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True, index=True)
    clicks: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    impressions: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    ctr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    position: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    device: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    property: Mapped["GscProperty"] = relationship("GscProperty", back_populates="gsc_data", lazy="selectin")
