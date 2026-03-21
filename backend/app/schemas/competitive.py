from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel


class DomainTrafficResponse(BaseModel):
    domain: str
    date: Optional[date] = None
    visits_est: Optional[int] = None
    unique_visitors_est: Optional[int] = None
    pages_per_visit: Optional[float] = None
    bounce_rate: Optional[float] = None
    avg_duration: Optional[float] = None
    traffic_sources: Optional[dict] = None
    geo_data: Optional[dict] = None

    model_config = {"from_attributes": True}


class CompareDomainsRequest(BaseModel):
    domains: List[str]
    metrics: Optional[List[str]] = None


class KeywordGapRequest(BaseModel):
    target_domain: str
    competitor_domains: List[str]
    gap_type: str = "missing"


class BacklinkGapRequest(BaseModel):
    target_domain: str
    competitor_domains: List[str]


class MarketSegmentCreate(BaseModel):
    name: str
    domains: List[str]


class MarketSegmentUpdate(BaseModel):
    name: Optional[str] = None
    domains: Optional[List[str]] = None


class MarketSegmentResponse(BaseModel):
    id: int
    project_id: int
    name: str
    domains: Optional[List[str]] = None
    metrics: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BatchAnalysisRequest(BaseModel):
    urls: List[str]
    metrics: Optional[List[str]] = None


class BatchAnalysisResponse(BaseModel):
    id: int
    project_id: int
    urls: Optional[List[str]] = None
    status: str
    results: Optional[dict] = None
    created_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
