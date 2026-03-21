from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class KeywordResearchRequest(BaseModel):
    seed: str
    location: str = "United States"
    language: str = "en"
    limit: int = 100


class KeywordResponse(BaseModel):
    id: Optional[int] = None
    keyword: str
    volume: Optional[int] = None
    difficulty: Optional[float] = None
    cpc: Optional[float] = None
    trend_data: Optional[dict] = None
    clicks_per_search: Optional[float] = None
    parent_topic: Optional[str] = None
    search_intent: Optional[str] = None

    model_config = {"from_attributes": True}


class KeywordClusterCreate(BaseModel):
    name: str
    parent_keyword: Optional[str] = None
    keywords: List[str]


class KeywordClusterResponse(BaseModel):
    id: int
    project_id: int
    name: str
    parent_keyword: Optional[str] = None
    keywords: Optional[List[str]] = None
    volume_total: Optional[int] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class KeywordListCreate(BaseModel):
    name: str
    keywords: List[str]


class KeywordListResponse(BaseModel):
    id: int
    project_id: int
    name: str
    keywords: Optional[List[str]] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class KeywordImportRequest(BaseModel):
    keywords: List[str]
    location: str = "United States"


class AiKeywordSuggestRequest(BaseModel):
    seed: str
    intent: Optional[str] = None
    niche: Optional[str] = None
    count: int = 20
