from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.deps import get_db, PaginationParams
from app.db.models.brand import BrandMention, AiCitation
from app.schemas.brand import (
    BrandMentionResponse, AiCitationResponse, BrandScanRequest,
    AiCitationScanRequest, ShareOfVoiceResponse, TrackedPromptCreate,
)

router = APIRouter()


@router.get("/mentions", response_model=List[BrandMentionResponse])
async def get_mentions(
    project_id: int = Query(...),
    sentiment: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(BrandMention).where(BrandMention.project_id == project_id)
    if sentiment:
        stmt = stmt.where(BrandMention.sentiment == sentiment)
    stmt = stmt.offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/mentions/scan")
async def scan_mentions(
    project_id: int = Query(...),
    request: BrandScanRequest = ...,
    db: AsyncSession = Depends(get_db),
):
    from app.db.models.jobs import Job
    job = Job(
        project_id=project_id,
        type="brand_scan",
        status="pending",
        result={"brand_name": request.brand_name, "keywords": request.keywords},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "status": "queued"}


@router.get("/ai-citations", response_model=List[AiCitationResponse])
async def get_ai_citations(
    project_id: int = Query(...),
    platform: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(AiCitation).where(AiCitation.project_id == project_id)
    if platform:
        stmt = stmt.where(AiCitation.llm_platform == platform)
    stmt = stmt.offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/ai-citations/scan")
async def scan_ai_citations(
    project_id: int = Query(...),
    request: AiCitationScanRequest = ...,
    db: AsyncSession = Depends(get_db),
):
    from app.services.ai_service import AIService
    svc = AIService()
    results = await svc.scan_llm_for_brand(
        request.llm_platforms[0] if request.llm_platforms else "openai",
        request.brand_name,
        request.prompts or [],
    )

    citations = []
    for item in results:
        citation = AiCitation(
            project_id=project_id,
            brand_name=request.brand_name,
            llm_platform=item.get("platform", ""),
            prompt=item.get("prompt"),
            brand_mentioned=item.get("brand_mentioned", False),
            url_cited=item.get("url_cited"),
            position=item.get("position"),
            sentiment=item.get("sentiment"),
            response_text=item.get("response_text"),
        )
        db.add(citation)
        citations.append(citation)

    await db.flush()
    return {"scanned": len(results), "citations_saved": len(citations)}


@router.get("/ai-citations/prompts")
async def get_tracked_prompts(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AiCitation.prompt).where(AiCitation.project_id == project_id).distinct()
    )
    prompts = [r[0] for r in result.all() if r[0]]
    return {"prompts": prompts}


@router.post("/ai-citations/prompts")
async def add_tracked_prompt(
    project_id: int = Query(...),
    prompt_in: TrackedPromptCreate = ...,
):
    return {"prompt": prompt_in.prompt, "project_id": project_id, "status": "tracked"}


@router.get("/share-of-voice")
async def get_share_of_voice(
    project_id: int = Query(...),
    brand_name: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(AiCitation.llm_platform, func.count(AiCitation.id).label("mentions"))
        .where(AiCitation.project_id == project_id, AiCitation.brand_mentioned == True)
        .group_by(AiCitation.llm_platform)
    )
    rows = result.all()
    total = sum(r.mentions for r in rows)
    platforms = [{"platform": r.llm_platform, "mentions": r.mentions, "share": round(r.mentions / max(total, 1) * 100, 1)} for r in rows]
    return ShareOfVoiceResponse(brand=brand_name, share_percentage=100.0, mention_count=total, platforms=platforms)


@router.get("/youtube")
async def get_youtube_mentions(
    project_id: int = Query(...),
    brand_name: str = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(BrandMention)
        .where(
            BrandMention.project_id == project_id,
            BrandMention.brand_name == brand_name,
            BrandMention.source_url.ilike("%youtube%"),
        )
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/competitors")
async def get_competitor_visibility(
    project_id: int = Query(...),
    competitors: str = Query(..., description="Comma-separated competitor brand names"),
    db: AsyncSession = Depends(get_db),
):
    competitor_list = [c.strip() for c in competitors.split(",")]

    comparison = []
    for brand in competitor_list:
        result = await db.execute(
            select(func.count(AiCitation.id).label("total"), func.count(AiCitation.id).filter(AiCitation.brand_mentioned == True).label("mentioned"))
            .where(AiCitation.project_id == project_id, AiCitation.brand_name == brand)
        )
        row = result.one()
        comparison.append({"brand": brand, "total": row.total, "mentioned": row.mentioned})

    return {"comparison": comparison}
