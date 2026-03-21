from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel


class AnalyticsEventIngest(BaseModel):
    site_id: str
    page_url: Optional[str] = None
    referrer: Optional[str] = None
    user_agent: Optional[str] = None
    event_type: str = "pageview"
    session_id: Optional[str] = None
    custom_data: Optional[dict] = None


class AnalyticsOverviewResponse(BaseModel):
    total_visitors: int
    total_pageviews: int
    bounce_rate: float
    avg_session_duration: float
    top_pages: List[dict]
    top_sources: List[dict]


class AnalyticsFunnelCreate(BaseModel):
    name: str
    steps: List[dict]


class AnalyticsFunnelResponse(BaseModel):
    id: int
    project_id: int
    name: str
    steps: Optional[List[dict]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AnalyticsGoalCreate(BaseModel):
    name: str
    type: str
    config: Optional[dict] = None


class AnalyticsGoalResponse(BaseModel):
    id: int
    project_id: int
    name: str
    type: str
    config: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class RealTimeResponse(BaseModel):
    active_visitors: int
    top_pages: List[dict]
    recent_events: List[dict]


class AiTrafficResponse(BaseModel):
    total_visits: int
    by_platform: List[dict]
    trend: List[dict]
