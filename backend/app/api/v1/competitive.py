from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, PaginationParams
from app.db.models.competitive import DomainTraffic, MarketSegment, BatchAnalysisJob
from app.schemas.competitive import (
    DomainTrafficResponse, CompareDomainsRequest,
    MarketSegmentCreate, MarketSegmentUpdate,
    MarketSegmentResponse, BatchAnalysisRequest, BatchAnalysisResponse,
)

router = APIRouter()


@router.get("/traffic/{domain}", response_model=List[DomainTrafficResponse])
async def get_domain_traffic(
    domain: str,
    months: int = Query(6),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DomainTraffic)
        .where(DomainTraffic.domain == domain)
        .order_by(DomainTraffic.date.desc())
        .limit(months)
    )
    data = result.scalars().all()
    if not data:
        from app.services.serp_service import DataForSEOClient
        client = DataForSEOClient()
        overview = await client.get_domain_overview(domain)
        return [DomainTrafficResponse(domain=domain, visits_est=overview.get("organic_traffic_est"))]
    return data


@router.post("/compare")
async def compare_domains(
    request: CompareDomainsRequest,
    db: AsyncSession = Depends(get_db),
):
    from app.services.serp_service import DataForSEOClient
    client = DataForSEOClient()
    results = {}
    for domain in request.domains:
        results[domain] = await client.get_domain_overview(domain)
    return {"comparison": results}


@router.get("/keyword-gap")
async def keyword_gap(
    target: str = Query(...),
    competitors: str = Query(..., description="Comma-separated competitors"),
    gap_type: str = Query("missing"),
    db: AsyncSession = Depends(get_db),
):
    from app.db.models.site_explorer import OrganicKeyword
    competitor_list = [c.strip() for c in competitors.split(",")]

    target_result = await db.execute(select(OrganicKeyword.keyword).where(OrganicKeyword.domain == target))
    target_keywords = set(r[0] for r in target_result.all())

    gaps = []
    for comp in competitor_list:
        comp_result = await db.execute(
            select(OrganicKeyword).where(OrganicKeyword.domain == comp)
        )
        for kw in comp_result.scalars().all():
            if gap_type == "missing" and kw.keyword not in target_keywords:
                gaps.append({"keyword": kw.keyword, "competitor": comp, "position": kw.position, "volume": kw.volume})

    return {"gaps": gaps[:500], "total": len(gaps)}


@router.get("/backlink-gap")
async def backlink_gap(
    target: str = Query(...),
    competitors: str = Query(..., description="Comma-separated competitors"),
    db: AsyncSession = Depends(get_db),
):
    from app.db.models.site_explorer import ReferringDomain
    competitor_list = [c.strip() for c in competitors.split(",")]

    target_result = await db.execute(select(ReferringDomain.domain).where(ReferringDomain.target_domain == target))
    target_domains = set(r[0] for r in target_result.all())

    opportunities = {}
    for comp in competitor_list:
        comp_result = await db.execute(select(ReferringDomain.domain).where(ReferringDomain.target_domain == comp))
        comp_domains = set(r[0] for r in comp_result.all())
        opportunities[comp] = list(comp_domains - target_domains)

    return {"opportunities": opportunities}


@router.post("/batch-analysis", response_model=BatchAnalysisResponse, status_code=201)
async def create_batch_analysis(
    project_id: int = Query(...),
    request: BatchAnalysisRequest = ...,
    db: AsyncSession = Depends(get_db),
):
    job = BatchAnalysisJob(project_id=project_id, urls=request.urls, status="pending")
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return job


@router.get("/batch-analysis/{job_id}", response_model=BatchAnalysisResponse)
async def get_batch_analysis(
    job_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(BatchAnalysisJob).where(BatchAnalysisJob.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Batch analysis job not found")
    return job


@router.get("/market-segments", response_model=List[MarketSegmentResponse])
async def list_segments(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MarketSegment).where(MarketSegment.project_id == project_id))
    return result.scalars().all()


@router.post("/market-segments", response_model=MarketSegmentResponse, status_code=201)
async def create_segment(
    project_id: int = Query(...),
    segment_in: MarketSegmentCreate = ...,
    db: AsyncSession = Depends(get_db),
):
    segment = MarketSegment(project_id=project_id, name=segment_in.name, domains=segment_in.domains)
    db.add(segment)
    await db.flush()
    await db.refresh(segment)
    return segment


@router.get("/market-segments/{segment_id}", response_model=MarketSegmentResponse)
async def get_segment(
    segment_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(MarketSegment).where(MarketSegment.id == segment_id))
    segment = result.scalar_one_or_none()
    if not segment:
        raise HTTPException(status_code=404, detail="Market segment not found")
    return segment
