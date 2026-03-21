from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc

from app.core.deps import get_db, PaginationParams
from app.db.models.local_seo import GbpProfile, LocalRankHistory, Review, Citation
from app.db.models.jobs import Job
from app.schemas.local_seo import (
    GbpProfileCreateBody,
    GbpProfileUpdateBody,
    ReviewRespondBody,
    ReviewAiSuggestBody,
    CitationScanBody,
)

router = APIRouter()


@router.get("/profiles")
async def list_gbp_profiles(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(GbpProfile)
        .where(GbpProfile.project_id == project_id)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    rows = result.scalars().all()
    out = []
    for p in rows:
        d = {c.name: getattr(p, c.name) for c in p.__table__.columns}
        d["completeness"] = int(p.completeness_score or 0)
        out.append(d)
    return out


@router.post("/profiles", status_code=201)
async def create_gbp_profile(
    body: GbpProfileCreateBody,
    db: AsyncSession = Depends(get_db),
):
    profile = GbpProfile(
        project_id=body.project_id,
        name=body.name,
        address=body.address,
        city=body.city,
        phone=body.phone,
        website=body.website,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


@router.get("/profiles/{profile_id}")
async def get_gbp_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GbpProfile).where(GbpProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="GBP profile not found")
    return profile


@router.put("/profiles/{profile_id}")
async def update_gbp_profile(
    profile_id: int,
    body: GbpProfileUpdateBody,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GbpProfile).where(GbpProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="GBP profile not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(profile, k, v)
    await db.flush()
    await db.refresh(profile)
    return profile


@router.post("/profiles/{profile_id}/sync", status_code=200)
async def sync_gbp_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GbpProfile).where(GbpProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="GBP profile not found")
    profile.last_synced_at = datetime.now(timezone.utc)
    job = Job(
        project_id=profile.project_id,
        type="gbp_sync",
        status="pending",
        result={"profile_id": profile_id},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"status": "queued", "job_id": job.id, "profile_id": profile_id}


@router.delete("/profiles/{profile_id}", status_code=204)
async def delete_gbp_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GbpProfile).where(GbpProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="GBP profile not found")
    await db.delete(profile)


@router.get("/rank-history")
async def get_local_rank_history(
    project_id: int = Query(...),
    keyword: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(LocalRankHistory).where(LocalRankHistory.project_id == project_id)
    if keyword:
        stmt = stmt.where(LocalRankHistory.keyword.ilike(f"%{keyword}%"))
    stmt = stmt.order_by(LocalRankHistory.date.desc()).offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/reviews")
async def list_reviews(
    profile_id: int = Query(...),
    rating: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(Review).where(Review.gbp_profile_id == profile_id)
    if rating is not None:
        stmt = stmt.where(Review.rating == rating)
    stmt = stmt.order_by(Review.published_at.desc()).offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/reviews/ai-suggest")
async def ai_suggest_from_text(body: ReviewAiSuggestBody):
    from app.services.ai_service import AIService
    svc = AIService()
    suggestion = await svc.suggest_review_response(
        body.review_text, body.rating, body.business_name
    )
    return {"suggestion": suggestion, "response": suggestion}


@router.post("/reviews/{review_id}/respond")
async def respond_to_review(
    review_id: int,
    body: ReviewRespondBody,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    review.response = body.response
    await db.flush()
    return {"status": "responded", "review_id": review_id}


@router.post("/reviews/{review_id}/ai-response")
async def ai_suggest_response(
    review_id: int,
    business_name: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Review).where(Review.id == review_id))
    review = result.scalar_one_or_none()
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")

    from app.services.ai_service import AIService
    svc = AIService()
    suggestion = await svc.suggest_review_response(
        review.text or "", review.rating or 3, business_name
    )
    return {"suggested_response": suggestion}


@router.get("/heatmap/{profile_id}")
async def local_heatmap(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GbpProfile).where(GbpProfile.id == profile_id))
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="GBP profile not found")
    hist = await db.execute(
        select(LocalRankHistory)
        .where(LocalRankHistory.project_id == profile.project_id)
        .order_by(desc(LocalRankHistory.date), desc(LocalRankHistory.id))
        .limit(300)
    )
    rows = hist.scalars().all()
    grid = [
        {
            "keyword": r.keyword,
            "location": r.location,
            "lat": r.lat,
            "lng": r.lng,
            "rank": r.local_rank,
            "position": r.local_rank if r.local_rank is not None else 99,
            "organic_rank": r.organic_rank,
            "date": r.date.isoformat() if r.date else None,
        }
        for r in rows
    ]
    msg = (
        None
        if grid
        else "No local rank rows for this project yet. Sync GBP or record rank checks to populate the heatmap."
    )
    return {"grid": grid, "profile_id": profile_id, "source": "local_rank_history", "message": msg}


@router.get("/citations")
async def list_citations(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(Citation)
        .where(Citation.project_id == project_id)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/citations/scan", status_code=202)
async def scan_citations(
    body: CitationScanBody,
    db: AsyncSession = Depends(get_db),
):
    job = Job(
        project_id=body.project_id,
        type="citation_scan",
        status="pending",
        result={"profile_id": body.profile_id},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "status": "queued"}


@router.post("/citations", status_code=201)
async def add_citation(
    project_id: int = Query(...),
    directory: str = Query(...),
    url: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    citation = Citation(project_id=project_id, directory=directory, url=url)
    db.add(citation)
    await db.flush()
    await db.refresh(citation)
    return citation
