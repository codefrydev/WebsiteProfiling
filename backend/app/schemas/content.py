from datetime import datetime
from typing import Optional, List, Union
from pydantic import BaseModel


class ContentScoreRequest(BaseModel):
    url: str
    keyword: str
    content: Optional[str] = None


class ContentScoreResponse(BaseModel):
    id: Optional[int] = None
    url: str
    keyword: Optional[str] = None
    score: Optional[float] = None
    details: Optional[dict] = None
    recommendations: Optional[List[Union[str, dict]]] = None

    model_config = {"from_attributes": True}


class ContentInventoryResponse(BaseModel):
    id: int
    project_id: int
    url: str
    title: Optional[str] = None
    word_count: Optional[int] = None
    published_at: Optional[datetime] = None
    last_updated: Optional[datetime] = None
    traffic_trend: Optional[dict] = None
    status: Optional[str] = None
    author: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TopicResearchResponse(BaseModel):
    id: int
    project_id: int
    seed_keyword: str
    topics: Optional[List[dict]] = None
    questions: Optional[List[str]] = None
    trends: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ContentBriefRequest(BaseModel):
    keyword: str
    intent: Optional[str] = None
    competitor_urls: Optional[List[str]] = None
    tone: Optional[str] = None
    word_count: Optional[int] = None


class ContentDraftRequest(BaseModel):
    brief: dict
    length: int = 1500
    tone: str = "professional"


class MetaTagsRequest(BaseModel):
    url: str
    content: Optional[str] = None
    keyword: str


class MetaTagsResponse(BaseModel):
    title: str
    description: str
    og_title: Optional[str] = None
    og_description: Optional[str] = None
    keywords: Optional[List[str]] = None


class ContentOptimizeRequest(BaseModel):
    content: str
    keyword: str
    url: Optional[str] = None


class ContentClusterRequest(BaseModel):
    urls: List[str]


class ContentChatRequest(BaseModel):
    messages: List[dict]
    context: Optional[dict] = None
