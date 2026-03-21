from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class PortfolioCreate(BaseModel):
    name: str
    description: Optional[str] = None
    urls: Optional[List[str]] = None
    settings: Optional[dict] = None


class PortfolioUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    urls: Optional[List[str]] = None
    settings: Optional[dict] = None


class PortfolioResponse(BaseModel):
    id: int
    workspace_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    urls: Optional[List[str]] = None
    settings: Optional[dict] = None
    health_score: Optional[float] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ReportTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    widgets: Optional[List[dict]] = None
    style: Optional[dict] = None
    is_public: bool = False


class ReportTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    widgets: Optional[List[dict]] = None
    style: Optional[dict] = None
    is_public: Optional[bool] = None


class ReportTemplateResponse(BaseModel):
    id: int
    workspace_id: Optional[int] = None
    name: str
    description: Optional[str] = None
    widgets: Optional[List[dict]] = None
    style: Optional[dict] = None
    is_public: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class GenerateReportRequest(BaseModel):
    template_id: int
    project_id: Optional[int] = None
    title: Optional[str] = None
    date_range: Optional[dict] = None


class GeneratedReportResponse(BaseModel):
    id: int
    template_id: Optional[int] = None
    project_id: Optional[int] = None
    title: str
    data: Optional[dict] = None
    file_path: Optional[str] = None
    generated_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScheduledReportCreate(BaseModel):
    template_id: int
    project_id: Optional[int] = None
    frequency: str
    recipients: Optional[List[str]] = None


class ScheduledReportResponse(BaseModel):
    id: int
    template_id: int
    project_id: Optional[int] = None
    frequency: str
    recipients: Optional[List[str]] = None
    last_sent_at: Optional[datetime] = None
    next_send_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
