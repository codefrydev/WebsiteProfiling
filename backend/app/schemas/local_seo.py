from typing import Optional
from pydantic import BaseModel


class GbpProfileCreateBody(BaseModel):
    project_id: int
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None


class GbpProfileUpdateBody(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    website: Optional[str] = None


class ReviewRespondBody(BaseModel):
    response: str


class ReviewAiSuggestBody(BaseModel):
    review_text: str
    rating: int = 5
    business_name: str = "Business"


class CitationScanBody(BaseModel):
    project_id: int
    profile_id: Optional[int] = None
