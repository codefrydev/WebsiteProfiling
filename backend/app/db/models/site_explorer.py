from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, ForeignKey, JSON, DateTime, Float, Boolean, BigInteger, func
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class DomainProfile(Base):
    __tablename__ = "domain_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    domain_rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    organic_traffic_est: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    organic_keywords_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    referring_domains_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    backlinks_count: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)
    traffic_value_est: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    fetched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Backlink(Base):
    __tablename__ = "backlinks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    source_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    target_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    anchor_text: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    link_type: Mapped[str] = mapped_column(String(20), default="text", nullable=False)
    is_dofollow: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    domain_rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    first_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_broken: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class ReferringDomain(Base):
    __tablename__ = "referring_domains"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    target_domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    backlinks_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    domain_rating: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    first_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class OrganicKeyword(Base):
    __tablename__ = "organic_keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    volume: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    traffic_est: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    serp_features: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    difficulty: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    search_intent: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    fetched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class PaidKeyword(Base):
    __tablename__ = "paid_keywords"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    domain: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    keyword: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    position: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    cpc: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    ad_copy: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    landing_page: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    fetched_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
