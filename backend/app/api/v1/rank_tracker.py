from typing import List, Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.deps import get_db, PaginationParams
from app.db.models.rank_tracker import TrackedKeyword, RankHistory, SerpSnapshot
from app.schemas.rank_tracker import (
    TrackedKeywordBulkCreate, TrackedKeywordResponse, RankHistoryResponse,
    SerpSnapshotResponse, VisibilityResponse, CannibalizationResponse,
)

router = APIRouter()


@router.get("/keywords", response_model=List[TrackedKeywordResponse])
async def list_tracked_keywords(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(TrackedKeyword)
        .where(TrackedKeyword.project_id == project_id, TrackedKeyword.is_active == True)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/keywords", response_model=List[TrackedKeywordResponse], status_code=status.HTTP_201_CREATED)
async def add_keywords(
    bulk_in: TrackedKeywordBulkCreate,
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    created = []
    for kw_in in bulk_in.keywords:
        kw = TrackedKeyword(project_id=project_id, **kw_in.model_dump())
        db.add(kw)
        created.append(kw)
    await db.flush()
    for kw in created:
        await db.refresh(kw)
    return created


@router.delete("/keywords/{keyword_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_keyword(
    keyword_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(TrackedKeyword).where(TrackedKeyword.id == keyword_id))
    kw = result.scalar_one_or_none()
    if not kw:
        raise HTTPException(status_code=404, detail="Keyword not found")
    kw.is_active = False


@router.get("/history", response_model=List[RankHistoryResponse])
async def get_rank_history(
    project_id: int = Query(...),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = (
        select(RankHistory)
        .join(TrackedKeyword, RankHistory.tracked_keyword_id == TrackedKeyword.id)
        .where(TrackedKeyword.project_id == project_id)
    )
    if start_date:
        stmt = stmt.where(RankHistory.date >= start_date)
    if end_date:
        stmt = stmt.where(RankHistory.date <= end_date)
    stmt = stmt.offset(pagination.skip).limit(pagination.limit)

    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/history/{keyword_id}", response_model=List[RankHistoryResponse])
async def get_keyword_history(
    keyword_id: int,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(RankHistory)
        .where(RankHistory.tracked_keyword_id == keyword_id)
        .order_by(RankHistory.date.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/check")
async def trigger_rank_check(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    from app.db.models.jobs import Job
    job = Job(project_id=project_id, type="rank_check", status="pending")
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "status": "queued"}


@router.get("/serp/{keyword_id}", response_model=Optional[SerpSnapshotResponse])
async def get_serp_snapshot(
    keyword_id: int,
    db: AsyncSession = Depends(get_db),
):
    result_kw = await db.execute(select(TrackedKeyword).where(TrackedKeyword.id == keyword_id))
    kw = result_kw.scalar_one_or_none()
    if not kw:
        raise HTTPException(status_code=404, detail="Keyword not found")

    result = await db.execute(
        select(SerpSnapshot)
        .where(SerpSnapshot.keyword == kw.keyword, SerpSnapshot.location == kw.location)
        .order_by(SerpSnapshot.date.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


@router.get("/visibility", response_model=List[VisibilityResponse])
async def get_visibility(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            RankHistory.date,
            func.avg(RankHistory.visibility_score).label("visibility_score"),
            func.count(RankHistory.id).label("tracked_keywords"),
        )
        .join(TrackedKeyword, RankHistory.tracked_keyword_id == TrackedKeyword.id)
        .where(TrackedKeyword.project_id == project_id)
        .group_by(RankHistory.date)
        .order_by(RankHistory.date.desc())
        .limit(90)
    )
    rows = result.all()
    return [
        VisibilityResponse(date=r.date, visibility_score=r.visibility_score or 0.0, tracked_keywords=r.tracked_keywords)
        for r in rows
    ]


@router.get("/cannibalization", response_model=List[CannibalizationResponse])
async def get_cannibalization(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TrackedKeyword).where(TrackedKeyword.project_id == project_id, TrackedKeyword.is_active == True)
    )
    keywords = result.scalars().all()

    cannibalization = []
    for kw in keywords:
        hist_result = await db.execute(
            select(RankHistory)
            .where(RankHistory.tracked_keyword_id == kw.id)
            .order_by(RankHistory.date.desc())
            .limit(1)
        )
        latest = hist_result.scalar_one_or_none()
        if latest and latest.url:
            cannibalization.append(
                CannibalizationResponse(
                    keyword=kw.keyword,
                    urls=[latest.url],
                    positions=[latest.position],
                )
            )
    return cannibalization
