from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, PaginationParams
from app.db.models.advertising import PpcKeyword, AdIntelligence
from app.schemas.advertising import AdCopyRequest

router = APIRouter()


@router.get("/keywords")
async def list_ppc_keywords(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(PpcKeyword)
        .where(PpcKeyword.project_id == project_id)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/keywords", status_code=201)
async def add_ppc_keyword(
    project_id: int = Query(...),
    keyword: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    ppc = PpcKeyword(project_id=project_id, keyword=keyword)
    db.add(ppc)
    await db.flush()
    await db.refresh(ppc)
    return ppc


@router.delete("/keywords/{keyword_id}", status_code=204)
async def delete_ppc_keyword(
    keyword_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(PpcKeyword).where(PpcKeyword.id == keyword_id))
    kw = result.scalar_one_or_none()
    if not kw:
        raise HTTPException(status_code=404, detail="PPC keyword not found")
    await db.delete(kw)


@router.get("/intelligence")
async def list_ad_intelligence(
    domain: str = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(AdIntelligence)
        .where(AdIntelligence.domain == domain)
        .order_by(AdIntelligence.last_seen.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/intelligence/fetch")
async def fetch_ad_intelligence(
    domain: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    from app.services.serp_service import DataForSEOClient
    client = DataForSEOClient()
    data = await client.get_domain_overview(domain)
    return {"domain": domain, "data": data}


@router.get("/competitor-ads")
async def get_competitor_ads(
    domain: str = Query(...),
    keyword: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(AdIntelligence).where(AdIntelligence.domain == domain)
    if keyword:
        stmt = stmt.where(AdIntelligence.keyword.ilike(f"%{keyword}%"))
    stmt = stmt.offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/keyword-cpc")
async def get_keyword_cpc(
    keywords: str = Query(..., description="Comma-separated keywords"),
    location: str = Query("United States"),
):
    from app.services.serp_service import DataForSEOClient
    client = DataForSEOClient()
    kw_list = [k.strip() for k in keywords.split(",")]
    data = await client.get_keywords_data(kw_list, location)
    return {"keywords": data}


@router.get("/ppc-research")
async def ppc_keyword_research(
    keyword: str = Query(...),
    location: str = Query("United States"),
):
    """Keyword/CPC ideas for a seed (UI: PPC research tab)."""
    from app.services.serp_service import DataForSEOClient
    client = DataForSEOClient()
    data = await client.get_keywords_data([keyword.strip()], location)
    return {"keywords": data}


@router.get("/competitors/{domain}")
async def competitor_ads_by_domain(
    domain: str,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    """Path-style alias for competitor ad rows (UI expects `ads` list)."""
    stmt = select(AdIntelligence).where(AdIntelligence.domain == domain)
    stmt = stmt.offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    ads = []
    for r in rows:
        data = r.data if isinstance(r.data, dict) else {}
        ads.append(
            {
                "keyword": r.keyword,
                "headline": data.get("headline") or (r.ad_copy or "")[:120],
                "title": data.get("title"),
                "description": data.get("description") or r.ad_copy,
                "display_url": data.get("display_url") or r.landing_page,
                "destination": r.landing_page,
                "cpc": data.get("cpc"),
                "position": r.position or data.get("position"),
            }
        )
    return {"domain": domain, "ads": ads, "spend_estimate": None, "paid_keywords": len(ads), "active_ads": len(ads)}


@router.post("/ai/copy")
async def generate_ad_copy(body: AdCopyRequest):
    from app.services.ai_service import AIService
    svc = AIService()
    base = (body.product or "").strip()
    if not base:
        return {"ads": []}
    audience = body.audience or "general audience"
    ads = await svc.generate_ppc_ad_variations(base, audience)
    return {"ads": ads}
