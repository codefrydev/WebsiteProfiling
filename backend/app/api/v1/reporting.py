from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, PaginationParams
from app.db.models.reporting import Portfolio, ReportTemplate, GeneratedReport, ScheduledReport
from app.schemas.reporting import PortfolioCreate, PortfolioUpdate, GenerateReportRequest

router = APIRouter()


@router.get("/portfolios")
async def list_portfolios(
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(Portfolio).offset(pagination.skip).limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/portfolios", status_code=201)
async def create_portfolio(
    body: PortfolioCreate,
    db: AsyncSession = Depends(get_db),
):
    portfolio = Portfolio(
        name=body.name,
        description=body.description,
        urls=body.urls,
        settings=body.settings,
    )
    db.add(portfolio)
    await db.flush()
    await db.refresh(portfolio)
    return portfolio


@router.put("/portfolios/{portfolio_id}")
async def update_portfolio(
    portfolio_id: int,
    body: PortfolioUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(portfolio, k, v)
    await db.flush()
    await db.refresh(portfolio)
    return portfolio


@router.get("/portfolios/{portfolio_id}/metrics")
async def portfolio_metrics(
    portfolio_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    urls = portfolio.urls or []
    rows = [{"url": u, "health_score": portfolio.health_score} for u in urls] if urls else []
    return {
        "portfolio_id": portfolio_id,
        "name": portfolio.name,
        "health_score": portfolio.health_score,
        "urls": rows,
    }


@router.get("/portfolios/{portfolio_id}")
async def get_portfolio(
    portfolio_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    return portfolio


@router.delete("/portfolios/{portfolio_id}", status_code=204)
async def delete_portfolio(
    portfolio_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Portfolio).where(Portfolio.id == portfolio_id))
    portfolio = result.scalar_one_or_none()
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    await db.delete(portfolio)


@router.get("/templates")
async def list_templates(
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(ReportTemplate).offset(pagination.skip).limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/templates", status_code=201)
async def create_template(
    name: str = Query(...),
    description: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    template = ReportTemplate(name=name, description=description)
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.get("/templates/{template_id}")
async def get_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReportTemplate).where(ReportTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.put("/templates/{template_id}")
async def update_template(
    template_id: int,
    name: Optional[str] = Query(None),
    description: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReportTemplate).where(ReportTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    if name is not None:
        template.name = name
    if description is not None:
        template.description = description
    await db.flush()
    await db.refresh(template)
    return template


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ReportTemplate).where(ReportTemplate.id == template_id))
    template = result.scalar_one_or_none()
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)


@router.get("/reports")
async def list_reports(
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(GeneratedReport)
    if project_id:
        stmt = stmt.where(GeneratedReport.project_id == project_id)
    stmt = stmt.order_by(GeneratedReport.created_at.desc()).offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


async def _create_generated_report(
    db: AsyncSession,
    template_id: int,
    project_id: Optional[int],
    title: str,
):
    report = GeneratedReport(template_id=template_id, project_id=project_id, title=title)
    db.add(report)
    await db.flush()
    await db.refresh(report)
    return report


@router.post("/reports/generate", status_code=201)
async def generate_report(
    body: GenerateReportRequest,
    db: AsyncSession = Depends(get_db),
):
    title = body.title or "Report"
    return await _create_generated_report(db, body.template_id, body.project_id, title)


@router.post("/generate", status_code=201)
async def generate_report_alias(
    body: GenerateReportRequest,
    db: AsyncSession = Depends(get_db),
):
    title = body.title or "Report"
    return await _create_generated_report(db, body.template_id, body.project_id, title)


@router.get("/scheduled")
async def list_scheduled_reports(
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(ScheduledReport)
        .where(ScheduledReport.is_active == True)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/scheduled", status_code=201)
async def create_scheduled_report(
    template_id: int = Query(...),
    frequency: str = Query(..., description="daily, weekly, monthly"),
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    scheduled = ScheduledReport(template_id=template_id, project_id=project_id, frequency=frequency)
    db.add(scheduled)
    await db.flush()
    await db.refresh(scheduled)
    return scheduled


@router.delete("/scheduled/{scheduled_id}", status_code=204)
async def delete_scheduled_report(
    scheduled_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ScheduledReport).where(ScheduledReport.id == scheduled_id))
    scheduled = result.scalar_one_or_none()
    if not scheduled:
        raise HTTPException(status_code=404, detail="Scheduled report not found")
    scheduled.is_active = False
