from datetime import datetime, date
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Date, Float, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class GbpProfile(Base):
    __tablename__ = "gbp_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    google_place_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    categories: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    hours: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    metrics: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    completeness_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    last_synced_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    reviews: Mapped[list["Review"]] = relationship("Review", back_populates="gbp_profile", lazy="selectin")


class LocalRankHistory(Base):
    __tablename__ = "local_rank_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(255), nullable=False)
    lat: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    lng: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    local_rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    organic_rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    competitor_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    gbp_profile_id: Mapped[int] = mapped_column(Integer, ForeignKey("gbp_profiles.id"), nullable=False, index=True)
    reviewer_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    response_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    sentiment: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    gbp_profile: Mapped["GbpProfile"] = relationship("GbpProfile", back_populates="reviews", lazy="selectin")


class Citation(Base):
    __tablename__ = "citations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    project_id: Mapped[int] = mapped_column(Integer, ForeignKey("projects.id"), nullable=False, index=True)
    directory: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    nap_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    status: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    issues: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
