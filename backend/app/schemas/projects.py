from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class ProjectCreate(BaseModel):
    name: str
    domain: Optional[str] = None
    settings: Optional[dict] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    settings: Optional[dict] = None


class ProjectResponse(BaseModel):
    id: int
    name: str
    domain: Optional[str] = None
    settings: Optional[dict] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
