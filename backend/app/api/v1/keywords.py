from typing import List
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, PaginationParams
from app.db.models.keywords import Keyword, KeywordCluster, KeywordList
from app.schemas.keywords import (
    KeywordResearchRequest, KeywordResponse, KeywordClusterCreate, KeywordClusterResponse,
    KeywordListCreate, KeywordListResponse, KeywordImportRequest, AiKeywordSuggestRequest,
)

router = APIRouter()


@router.post("/research", response_model=List[KeywordResponse])
async def research_keywords(
    request: KeywordResearchRequest,
    db: AsyncSession = Depends(get_db),
):
    from app.services.serp_service import DataForSEOClient
    client = DataForSEOClient()
    results = await client.get_keyword_suggestions(request.seed, request.location)
    return [KeywordResponse(**r) for r in results[:request.limit]]


@router.get("/search", response_model=List[KeywordResponse])
async def search_keywords(
    q: str = Query(..., min_length=1),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(Keyword)
        .where(Keyword.keyword.ilike(f"%{q}%"))
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/cluster", response_model=KeywordClusterResponse)
async def cluster_keywords(
    project_id: int = Query(...),
    cluster_in: KeywordClusterCreate = ...,
    db: AsyncSession = Depends(get_db),
):
    cluster = KeywordCluster(
        project_id=project_id,
        name=cluster_in.name,
        parent_keyword=cluster_in.parent_keyword,
        keywords=cluster_in.keywords,
    )
    db.add(cluster)
    await db.flush()
    await db.refresh(cluster)
    return cluster


@router.get("/serp")
async def get_serp(
    keyword: str = Query(...),
    location: str = Query("United States"),
    device: str = Query("desktop"),
):
    from app.services.serp_service import DataForSEOClient
    client = DataForSEOClient()
    return await client.get_serp_results(keyword, location, device)


@router.post("/suggestions/ai", response_model=List[str])
async def ai_keyword_suggestions(
    request: AiKeywordSuggestRequest,
):
    from app.services.ai_service import AIService
    svc = AIService()
    brief = await svc.generate_content_brief(request.seed, request.intent or "informational", [])
    suggestions = brief.get("keywords", [])
    return suggestions[:request.count]


@router.get("/questions", response_model=List[KeywordResponse])
async def get_question_keywords(
    seed: str = Query(...),
    location: str = Query("United States"),
):
    from app.services.serp_service import DataForSEOClient
    client = DataForSEOClient()
    results = await client.get_keyword_suggestions(f"who what how why {seed}", location)
    return [KeywordResponse(**r) for r in results[:50]]


@router.get("/related", response_model=List[KeywordResponse])
async def get_related_keywords(
    keyword: str = Query(...),
    location: str = Query("United States"),
):
    from app.services.serp_service import DataForSEOClient
    client = DataForSEOClient()
    results = await client.get_keyword_suggestions(keyword, location)
    return [KeywordResponse(**r) for r in results[:50]]


@router.post("/import", response_model=List[KeywordResponse])
async def import_keywords(
    request: KeywordImportRequest,
    db: AsyncSession = Depends(get_db),
):
    from app.services.serp_service import DataForSEOClient
    client = DataForSEOClient()
    data = await client.get_keywords_data(request.keywords, request.location)
    results = []
    for item in data:
        kw = Keyword(**{k: v for k, v in item.items() if k in Keyword.__table__.columns})
        db.add(kw)
        results.append(KeywordResponse(**item))
    await db.flush()
    return results


@router.get("/export")
async def export_keywords(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    import csv
    import io

    result = await db.execute(
        select(KeywordList).where(KeywordList.project_id == project_id)
    )
    lists = result.scalars().all()
    all_keywords = []
    for kl in lists:
        all_keywords.extend(kl.keywords or [])

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["keyword"])
    for kw in all_keywords:
        writer.writerow([kw])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=keywords.csv"},
    )
