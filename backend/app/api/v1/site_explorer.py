from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, PaginationParams
from app.db.models.site_explorer import (
    DomainProfile, Backlink, ReferringDomain, OrganicKeyword, PaidKeyword,
)
from app.schemas.site_explorer import (
    DomainProfileResponse, BacklinkResponse, ReferringDomainResponse,
    OrganicKeywordResponse, PaidKeywordResponse,
)

router = APIRouter()


@router.get("/overview/{domain}", response_model=DomainProfileResponse)
async def domain_overview(
    domain: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DomainProfile).where(DomainProfile.domain == domain).order_by(DomainProfile.created_at.desc()).limit(1)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        from app.services.serp_service import DataForSEOClient
        client = DataForSEOClient()
        data = await client.get_domain_overview(domain)
        return DomainProfileResponse(domain=domain, **data)
    return profile


@router.get("/backlinks/{domain}", response_model=List[BacklinkResponse])
async def get_backlinks(
    domain: str,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(Backlink)
        .where(Backlink.domain == domain)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/referring-domains/{domain}", response_model=List[ReferringDomainResponse])
async def get_referring_domains(
    domain: str,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(ReferringDomain)
        .where(ReferringDomain.target_domain == domain)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/organic-keywords/{domain}", response_model=List[OrganicKeywordResponse])
async def get_organic_keywords(
    domain: str,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(OrganicKeyword)
        .where(OrganicKeyword.domain == domain)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/paid-keywords/{domain}", response_model=List[PaidKeywordResponse])
async def get_paid_keywords(
    domain: str,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(PaidKeyword)
        .where(PaidKeyword.domain == domain)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/broken-backlinks/{domain}", response_model=List[BacklinkResponse])
async def get_broken_backlinks(
    domain: str,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(Backlink)
        .where(Backlink.domain == domain, Backlink.is_broken == True)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/outgoing-links/{domain}")
async def get_outgoing_links(
    domain: str,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(Backlink)
        .where(Backlink.source_url.ilike(f"%{domain}%"))
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/content-gap")
async def content_gap(
    target: str = Query(...),
    competitors: str = Query(..., description="Comma-separated competitor domains"),
    db: AsyncSession = Depends(get_db),
):
    competitor_list = [c.strip() for c in competitors.split(",")]

    target_kws = await db.execute(
        select(OrganicKeyword.keyword).where(OrganicKeyword.domain == target)
    )
    target_set = set(r[0] for r in target_kws.all())

    gaps = []
    for competitor in competitor_list:
        comp_kws = await db.execute(
            select(OrganicKeyword).where(OrganicKeyword.domain == competitor)
        )
        for kw in comp_kws.scalars().all():
            if kw.keyword not in target_set:
                gaps.append({"keyword": kw.keyword, "competitor": competitor, "volume": kw.volume})

    return {"gaps": gaps[:500], "total": len(gaps)}


@router.get("/link-intersect")
async def link_intersect(
    target: str = Query(...),
    competitors: str = Query(..., description="Comma-separated competitor domains"),
    db: AsyncSession = Depends(get_db),
):
    competitor_list = [c.strip() for c in competitors.split(",")]

    target_refs = await db.execute(
        select(ReferringDomain.domain).where(ReferringDomain.target_domain == target)
    )
    target_domains = set(r[0] for r in target_refs.all())

    intersect = {}
    for competitor in competitor_list:
        comp_refs = await db.execute(
            select(ReferringDomain.domain).where(ReferringDomain.target_domain == competitor)
        )
        comp_domains = set(r[0] for r in comp_refs.all())
        intersect[competitor] = list(comp_domains - target_domains)

    return {"intersect": intersect}


@router.get("/anchor-text/{domain}")
async def get_anchor_text(
    domain: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Backlink.anchor_text).where(Backlink.domain == domain)
    )
    anchors: dict = {}
    for row in result.all():
        text = row[0] or "(empty)"
        anchors[text] = anchors.get(text, 0) + 1

    sorted_anchors = sorted(anchors.items(), key=lambda x: x[1], reverse=True)
    return {"anchors": [{"text": a[0], "count": a[1]} for a in sorted_anchors[:100]]}


@router.post("/fetch/{domain}")
async def fetch_domain_data(
    domain: str,
    db: AsyncSession = Depends(get_db),
):
    from app.db.models.jobs import Job
    job = Job(type="domain_fetch", status="pending", result={"domain": domain})
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "status": "queued", "domain": domain}
