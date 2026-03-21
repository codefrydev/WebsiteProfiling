from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel


class GscPropertyCreate(BaseModel):
    site_url: str
    project_id: int


class GscPropertyResponse(BaseModel):
    id: int
    project_id: int
    site_url: str
    verified: bool
    last_synced_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class GscDataResponse(BaseModel):
    id: int
    property_id: int
    date: date
    query: Optional[str] = None
    page: Optional[str] = None
    clicks: Optional[int] = None
    impressions: Optional[int] = None
    ctr: Optional[float] = None
    position: Optional[float] = None
    device: Optional[str] = None
    country: Optional[str] = None

    model_config = {"from_attributes": True}


class GscOverviewResponse(BaseModel):
    total_clicks: int
    total_impressions: int
    avg_ctr: float
    avg_position: float
    date_range: str
    trend: Optional[dict] = None


class GscQueryRow(BaseModel):
    query: str
    clicks: int
    impressions: int
    ctr: float
    position: float


class GscPageRow(BaseModel):
    page: str
    clicks: int
    impressions: int
    ctr: float
    position: float


class GscOpportunityKeyword(BaseModel):
    query: str
    position: float
    impressions: int
    clicks: int
    ctr: float
    potential_clicks: int
