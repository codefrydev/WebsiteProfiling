from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class DomainProfileResponse(BaseModel):
    id: Optional[int] = None
    domain: str
    domain_rating: Optional[float] = None
    organic_traffic_est: Optional[int] = None
    organic_keywords_count: Optional[int] = None
    referring_domains_count: Optional[int] = None
    backlinks_count: Optional[int] = None
    traffic_value_est: Optional[float] = None
    data: Optional[dict] = None
    fetched_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BacklinkResponse(BaseModel):
    id: int
    domain: str
    source_url: str
    target_url: str
    anchor_text: Optional[str] = None
    link_type: str
    is_dofollow: bool
    domain_rating: Optional[float] = None
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    is_broken: bool

    model_config = {"from_attributes": True}


class ReferringDomainResponse(BaseModel):
    id: int
    domain: str
    target_domain: str
    backlinks_count: Optional[int] = None
    domain_rating: Optional[float] = None
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None

    model_config = {"from_attributes": True}


class OrganicKeywordResponse(BaseModel):
    id: int
    domain: str
    keyword: str
    position: Optional[int] = None
    volume: Optional[int] = None
    traffic_est: Optional[int] = None
    url: Optional[str] = None
    serp_features: Optional[dict] = None
    difficulty: Optional[float] = None
    search_intent: Optional[str] = None

    model_config = {"from_attributes": True}


class PaidKeywordResponse(BaseModel):
    id: int
    domain: str
    keyword: str
    position: Optional[int] = None
    cpc: Optional[float] = None
    ad_copy: Optional[str] = None
    landing_page: Optional[str] = None

    model_config = {"from_attributes": True}


class ContentGapRequest(BaseModel):
    target_domain: str
    competitor_domains: List[str]


class LinkIntersectRequest(BaseModel):
    target_domain: str
    competitor_domains: List[str]
