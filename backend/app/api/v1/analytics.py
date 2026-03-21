from typing import List, Optional
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.deps import get_db, PaginationParams
from app.db.models.analytics import AnalyticsEvent, AnalyticsFunnel, AnalyticsGoal
from app.schemas.analytics import (
    AnalyticsEventIngest, AnalyticsOverviewResponse, AnalyticsFunnelCreate,
    AnalyticsFunnelResponse, AnalyticsGoalCreate, AnalyticsGoalResponse,
    RealTimeResponse, AiTrafficResponse,
)

router = APIRouter()

AI_BOT_PATTERNS = ["GPTBot", "Claude-Web", "Google-Extended", "PerplexityBot", "YouBot", "anthropic-ai"]


def _resolve_site_id(site_id: Optional[str], project_id: Optional[int]) -> str:
    if site_id:
        return site_id
    if project_id is not None:
        return str(project_id)
    raise HTTPException(status_code=422, detail="site_id or project_id is required")


@router.post("/events", status_code=202)
async def ingest_event(
    event: AnalyticsEventIngest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    ua = event.user_agent or request.headers.get("user-agent", "")
    is_bot = any(pattern.lower() in ua.lower() for pattern in AI_BOT_PATTERNS + ["bot", "spider", "crawler"])
    bot_name = next((p for p in AI_BOT_PATTERNS if p.lower() in ua.lower()), None)

    ev = AnalyticsEvent(
        site_id=event.site_id,
        timestamp=datetime.now(timezone.utc),
        page_url=event.page_url,
        referrer=event.referrer,
        user_agent=ua,
        event_type=event.event_type,
        session_id=event.session_id,
        custom_data=event.custom_data,
        is_bot=is_bot,
        bot_name=bot_name,
    )
    db.add(ev)
    return {"status": "accepted"}


@router.get("/overview")
async def get_overview(
    site_id: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    days: int = Query(30),
    db: AsyncSession = Depends(get_db),
):
    sid = _resolve_site_id(site_id, project_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(func.count(AnalyticsEvent.id).label("total"))
        .where(AnalyticsEvent.site_id == sid, AnalyticsEvent.timestamp >= since, AnalyticsEvent.is_bot == False)
    )
    total = result.scalar() or 0
    return {"site_id": sid, "total_events": total, "days": days}


@router.get("/pages")
async def get_top_pages(
    site_id: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    days: int = Query(30),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    sid = _resolve_site_id(site_id, project_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(AnalyticsEvent.page_url, func.count(AnalyticsEvent.id).label("views"))
        .where(AnalyticsEvent.site_id == sid, AnalyticsEvent.timestamp >= since, AnalyticsEvent.is_bot == False)
        .group_by(AnalyticsEvent.page_url)
        .order_by(func.count(AnalyticsEvent.id).desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return [{"page": r.page_url, "views": r.views} for r in result.all()]


@router.get("/sources")
async def get_traffic_sources(
    site_id: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    days: int = Query(30),
    db: AsyncSession = Depends(get_db),
):
    sid = _resolve_site_id(site_id, project_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(AnalyticsEvent.referrer, func.count(AnalyticsEvent.id).label("visits"))
        .where(AnalyticsEvent.site_id == sid, AnalyticsEvent.timestamp >= since, AnalyticsEvent.is_bot == False)
        .group_by(AnalyticsEvent.referrer)
        .order_by(func.count(AnalyticsEvent.id).desc())
        .limit(20)
    )
    return [{"referrer": r.referrer, "visits": r.visits} for r in result.all()]


@router.get("/devices")
async def get_devices(
    site_id: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    days: int = Query(30),
    db: AsyncSession = Depends(get_db),
):
    sid = _resolve_site_id(site_id, project_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(AnalyticsEvent.device, func.count(AnalyticsEvent.id).label("count"))
        .where(AnalyticsEvent.site_id == sid, AnalyticsEvent.timestamp >= since, AnalyticsEvent.is_bot == False)
        .group_by(AnalyticsEvent.device)
        .order_by(func.count(AnalyticsEvent.id).desc())
    )
    return [{"device": r.device, "count": r.count} for r in result.all()]


@router.get("/geo")
async def get_geo(
    site_id: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    days: int = Query(30),
    db: AsyncSession = Depends(get_db),
):
    sid = _resolve_site_id(site_id, project_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(AnalyticsEvent.country, func.count(AnalyticsEvent.id).label("visits"))
        .where(AnalyticsEvent.site_id == sid, AnalyticsEvent.timestamp >= since, AnalyticsEvent.is_bot == False)
        .group_by(AnalyticsEvent.country)
        .order_by(func.count(AnalyticsEvent.id).desc())
        .limit(50)
    )
    return [{"country": r.country, "visits": r.visits} for r in result.all()]


@router.get("/realtime", response_model=RealTimeResponse)
async def get_realtime(
    site_id: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    sid = _resolve_site_id(site_id, project_id)
    since = datetime.now(timezone.utc) - timedelta(minutes=5)
    result = await db.execute(
        select(func.count(func.distinct(AnalyticsEvent.session_id)).label("active"))
        .where(AnalyticsEvent.site_id == sid, AnalyticsEvent.timestamp >= since, AnalyticsEvent.is_bot == False)
    )
    active = result.scalar() or 0

    pages_result = await db.execute(
        select(AnalyticsEvent.page_url, func.count(AnalyticsEvent.id).label("views"))
        .where(AnalyticsEvent.site_id == sid, AnalyticsEvent.timestamp >= since)
        .group_by(AnalyticsEvent.page_url)
        .order_by(func.count(AnalyticsEvent.id).desc())
        .limit(5)
    )
    top_pages = [{"page": r.page_url, "views": r.views} for r in pages_result.all()]

    recent_result = await db.execute(
        select(AnalyticsEvent)
        .where(AnalyticsEvent.site_id == sid, AnalyticsEvent.timestamp >= since)
        .order_by(AnalyticsEvent.timestamp.desc())
        .limit(10)
    )
    recent = [{"event_type": e.event_type, "page": e.page_url, "ts": str(e.timestamp)} for e in recent_result.scalars().all()]

    return RealTimeResponse(active_visitors=active, top_pages=top_pages, recent_events=recent)


@router.get("/ai-traffic", response_model=AiTrafficResponse)
async def get_ai_traffic(
    site_id: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    days: int = Query(30),
    db: AsyncSession = Depends(get_db),
):
    sid = _resolve_site_id(site_id, project_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(AnalyticsEvent.bot_name, func.count(AnalyticsEvent.id).label("visits"))
        .where(
            AnalyticsEvent.site_id == sid,
            AnalyticsEvent.timestamp >= since,
            AnalyticsEvent.is_bot == True,
            AnalyticsEvent.bot_name.isnot(None),
        )
        .group_by(AnalyticsEvent.bot_name)
        .order_by(func.count(AnalyticsEvent.id).desc())
    )
    by_platform = [{"platform": r.bot_name, "visits": r.visits} for r in result.all()]
    total = sum(p["visits"] for p in by_platform)
    return AiTrafficResponse(total_visits=total, by_platform=by_platform, trend=[])


@router.get("/bots")
async def get_bots(
    site_id: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    days: int = Query(30),
    db: AsyncSession = Depends(get_db),
):
    sid = _resolve_site_id(site_id, project_id)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(AnalyticsEvent.bot_name, func.count(AnalyticsEvent.id).label("visits"))
        .where(AnalyticsEvent.site_id == sid, AnalyticsEvent.timestamp >= since, AnalyticsEvent.is_bot == True)
        .group_by(AnalyticsEvent.bot_name)
        .order_by(func.count(AnalyticsEvent.id).desc())
    )
    return [{"bot_name": r.bot_name, "visits": r.visits} for r in result.all()]


@router.post("/funnels", response_model=AnalyticsFunnelResponse, status_code=201)
async def create_funnel(
    project_id: int = Query(...),
    funnel_in: AnalyticsFunnelCreate = ...,
    db: AsyncSession = Depends(get_db),
):
    funnel = AnalyticsFunnel(project_id=project_id, name=funnel_in.name, steps=funnel_in.steps)
    db.add(funnel)
    await db.flush()
    await db.refresh(funnel)
    return funnel


@router.get("/funnels", response_model=List[AnalyticsFunnelResponse])
async def list_funnels(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AnalyticsFunnel).where(AnalyticsFunnel.project_id == project_id))
    return result.scalars().all()


@router.get("/funnels/{funnel_id}")
async def get_funnel(
    funnel_id: int,
    site_id: Optional[str] = Query(None),
    project_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AnalyticsFunnel).where(AnalyticsFunnel.id == funnel_id))
    funnel = result.scalar_one_or_none()
    if not funnel:
        raise HTTPException(status_code=404, detail="Funnel not found")
    _resolve_site_id(site_id, project_id if project_id is not None else funnel.project_id)
    return {"funnel": AnalyticsFunnelResponse.model_validate(funnel), "analysis": {"completion_rate": 0.0, "steps": []}}


@router.post("/goals", response_model=AnalyticsGoalResponse, status_code=201)
async def create_goal(
    project_id: int = Query(...),
    goal_in: AnalyticsGoalCreate = ...,
    db: AsyncSession = Depends(get_db),
):
    goal = AnalyticsGoal(project_id=project_id, name=goal_in.name, type=goal_in.type, config=goal_in.config)
    db.add(goal)
    await db.flush()
    await db.refresh(goal)
    return goal


@router.get("/goals", response_model=List[AnalyticsGoalResponse])
async def list_goals(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AnalyticsGoal).where(AnalyticsGoal.project_id == project_id))
    return result.scalars().all()
