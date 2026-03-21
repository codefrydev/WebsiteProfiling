from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class SocialAccountCreate(BaseModel):
    project_id: int
    platform: str
    profile_data: Optional[dict] = None


class SocialPostCreate(BaseModel):
    project_id: int
    content: str
    platforms: Optional[List[str]] = None
    account_ids: Optional[List[int]] = None
    scheduled_at: Optional[str] = None


class SocialPostUpdate(BaseModel):
    content: Optional[str] = None
    status: Optional[str] = None

