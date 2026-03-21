from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel


class TrackedKeywordCreate(BaseModel):
    keyword: str
    location: str = "United States"
    device: str = "desktop"
    language: str = "en"
    tags: Optional[List[str]] = None


class TrackedKeywordBulkCreate(BaseModel):
    keywords: List[TrackedKeywordCreate]


class TrackedKeywordResponse(BaseModel):
    id: int
    project_id: int
    keyword: str
    location: str
    device: str
    language: str
    tags: Optional[List[str]] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class RankHistoryResponse(BaseModel):
    id: int
    tracked_keyword_id: int
    date: date
    position: Optional[int] = None
    previous_position: Optional[int] = None
    url: Optional[str] = None
    serp_features: Optional[dict] = None
    visibility_score: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SerpSnapshotResponse(BaseModel):
    id: int
    keyword: str
    location: str
    device: str
    date: date
    results: Optional[dict] = None
    features: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VisibilityResponse(BaseModel):
    date: date
    visibility_score: float
    tracked_keywords: int


class CannibalizationResponse(BaseModel):
    keyword: str
    urls: List[str]
    positions: List[Optional[int]]
