from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, PaginationParams
from app.db.models.content import ContentItem, ContentScore, ContentInventory, TopicResearch
from app.schemas.content import (
    ContentScoreRequest, ContentScoreResponse, ContentInventoryResponse,
    TopicResearchResponse, ContentBriefRequest, ContentDraftRequest,
    MetaTagsRequest, MetaTagsResponse, ContentOptimizeRequest, ContentClusterRequest,
    ContentChatRequest,
)

router = APIRouter()


@router.get("/explorer")
async def search_content(
    q: str = Query(...),
    domain: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(ContentItem).where(ContentItem.title.ilike(f"%{q}%"))
    if domain:
        stmt = stmt.where(ContentItem.domain == domain)
    stmt = stmt.offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/score", response_model=ContentScoreResponse)
async def grade_content(
    project_id: int = Query(...),
    request: ContentScoreRequest = ...,
    db: AsyncSession = Depends(get_db),
):
    from app.services.ai_service import AIService
    svc = AIService()
    graded = await svc.grade_content(request.content or "", request.keyword, [])

    score = ContentScore(
        project_id=project_id,
        url=request.url,
        keyword=request.keyword,
        score=graded.get("score"),
        details=graded.get("details"),
        recommendations=graded.get("recommendations"),
    )
    db.add(score)
    await db.flush()
    await db.refresh(score)
    return score


@router.get("/inventory", response_model=List[ContentInventoryResponse])
async def get_inventory(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(ContentInventory)
        .where(ContentInventory.project_id == project_id)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/inventory/sync")
async def sync_inventory(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    from app.db.models.jobs import Job
    job = Job(project_id=project_id, type="inventory_sync", status="pending")
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "status": "queued"}


@router.get("/inventory/decay")
async def detect_decay(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ContentInventory)
        .where(ContentInventory.project_id == project_id, ContentInventory.status == "decaying")
    )
    return result.scalars().all()


@router.post("/ai/brief")
async def generate_brief(
    request: ContentBriefRequest,
):
    from app.services.ai_service import AIService
    svc = AIService()
    brief = await svc.generate_content_brief(
        request.keyword,
        request.intent or "informational",
        [],
    )
    return brief


@router.post("/ai/draft")
async def generate_draft(
    request: ContentDraftRequest,
):
    from app.services.ai_service import AIService
    svc = AIService()
    draft = await svc.generate_article_draft(request.brief, request.length)
    return {"draft": draft}


@router.post("/ai/meta", response_model=MetaTagsResponse)
async def generate_meta(
    request: MetaTagsRequest,
):
    from app.services.ai_service import AIService
    svc = AIService()
    tags = await svc.generate_meta_tags(request.url, request.content or "", request.keyword)
    return MetaTagsResponse(**tags)


@router.post("/ai/optimize")
async def optimize_content(
    request: ContentOptimizeRequest,
):
    from app.services.ai_service import AIService
    svc = AIService()
    result = await svc.grade_content(request.content, request.keyword, [])
    return {"suggestions": result.get("recommendations", []), "score": result.get("score")}


@router.post("/ai/chat")
async def content_ai_chat(request: ContentChatRequest):
    from app.services.ai_service import AIService
    svc = AIService()
    reply = await svc.chat_seo_advisor(request.messages, request.context)
    return {"reply": reply}


@router.get("/topic-research", response_model=List[TopicResearchResponse])
async def topic_research(
    project_id: int = Query(...),
    seed: Optional[str] = Query(None),
    keyword: Optional[str] = Query(None, description="Alias for seed"),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    seed_val = seed or keyword
    stmt = select(TopicResearch).where(TopicResearch.project_id == project_id)
    if seed_val:
        stmt = stmt.where(TopicResearch.seed_keyword.ilike(f"%{seed_val}%"))
    stmt = stmt.offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/clusters")
async def cluster_content(
    project_id: int = Query(...),
    request: ContentClusterRequest = ...,
    db: AsyncSession = Depends(get_db),
):
    from app.db.models.jobs import Job
    job = Job(project_id=project_id, type="content_cluster", status="pending", result={"urls": request.urls})
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "status": "queued", "url_count": len(request.urls)}
