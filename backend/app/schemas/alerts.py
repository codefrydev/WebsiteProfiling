from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class AlertCreate(BaseModel):
    project_id: int
    name: str
    type: str
    config: Optional[dict] = None
    channels: Optional[dict] = None
    is_active: bool = True


class AlertUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    config: Optional[dict] = None
    channels: Optional[dict] = None
    is_active: Optional[bool] = None


class AlertResponse(BaseModel):
    id: int
    project_id: int
    name: str
    type: str
    config: Optional[dict] = None
    channels: Optional[dict] = None
    is_active: bool
    last_triggered_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertHistoryResponse(BaseModel):
    id: int
    alert_id: int
    triggered_at: datetime
    data: Optional[dict] = None
    channels_sent: Optional[dict] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class JobResponse(BaseModel):
    id: int
    workspace_id: Optional[int] = None
    project_id: Optional[int] = None
    type: str
    status: str
    progress: int
    result: Optional[dict] = None
    error: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None

    model_config = {"from_attributes": True}
