from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class BrandMentionResponse(BaseModel):
    id: int
    project_id: int
    brand_name: str
    source_url: Optional[str] = None
    date: Optional[datetime] = None
    context_text: Optional[str] = None
    sentiment: Optional[str] = None
    mention_type: Optional[str] = None
    is_linked: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class AiCitationResponse(BaseModel):
    id: int
    project_id: int
    brand_name: str
    llm_platform: str
    prompt: Optional[str] = None
    date: Optional[datetime] = None
    brand_mentioned: bool
    url_cited: Optional[str] = None
    position: Optional[int] = None
    sentiment: Optional[str] = None
    response_text: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class BrandScanRequest(BaseModel):
    brand_name: str
    keywords: Optional[List[str]] = None


class AiCitationScanRequest(BaseModel):
    brand_name: str
    llm_platforms: List[str] = ["openai", "anthropic"]
    prompts: Optional[List[str]] = None


class ShareOfVoiceResponse(BaseModel):
    brand: str
    share_percentage: float
    mention_count: int
    platforms: List[dict]


class TrackedPromptCreate(BaseModel):
    prompt: str
    category: Optional[str] = None
