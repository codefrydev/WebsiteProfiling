from typing import List, Optional
from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.deps import get_db, PaginationParams
from app.db.models.gsc import GscProperty, GscData
from app.schemas.gsc import (
    GscPropertyCreate, GscPropertyResponse, GscDataResponse,
    GscOverviewResponse, GscQueryRow, GscPageRow, GscOpportunityKeyword,
)

router = APIRouter()


@router.get("/properties", response_model=List[GscPropertyResponse])
async def list_properties(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GscProperty).where(GscProperty.project_id == project_id)
    )
    return result.scalars().all()


@router.post("/properties", response_model=GscPropertyResponse)
async def add_property(
    prop_in: GscPropertyCreate,
    db: AsyncSession = Depends(get_db),
):
    prop = GscProperty(project_id=prop_in.project_id, site_url=prop_in.site_url)
    db.add(prop)
    await db.flush()
    await db.refresh(prop)
    return prop


@router.delete("/properties/{property_id}", status_code=204)
async def remove_property(
    property_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GscProperty).where(GscProperty.id == property_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    await db.delete(prop)


@router.post("/sync/{property_id}")
async def sync_property(
    property_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(GscProperty).where(GscProperty.id == property_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")

    from app.db.models.jobs import Job
    job = Job(type="gsc_sync", status="pending", result={"property_id": property_id})
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "status": "queued"}


@router.get("/overview/{property_id}", response_model=GscOverviewResponse)
async def get_overview(
    property_id: int,
    days: int = Query(28),
    db: AsyncSession = Depends(get_db),
):
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(
            func.sum(GscData.clicks).label("total_clicks"),
            func.sum(GscData.impressions).label("total_impressions"),
            func.avg(GscData.ctr).label("avg_ctr"),
            func.avg(GscData.position).label("avg_position"),
        ).where(GscData.property_id == property_id, GscData.date >= since)
    )
    row = result.one()
    return GscOverviewResponse(
        total_clicks=int(row.total_clicks or 0),
        total_impressions=int(row.total_impressions or 0),
        avg_ctr=float(row.avg_ctr or 0),
        avg_position=float(row.avg_position or 0),
        date_range=f"{since} to {date.today()}",
    )


@router.get("/queries/{property_id}", response_model=List[GscQueryRow])
async def get_queries(
    property_id: int,
    days: int = Query(28),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(
            GscData.query,
            func.sum(GscData.clicks).label("clicks"),
            func.sum(GscData.impressions).label("impressions"),
            func.avg(GscData.ctr).label("ctr"),
            func.avg(GscData.position).label("position"),
        )
        .where(GscData.property_id == property_id, GscData.date >= since, GscData.query.isnot(None))
        .group_by(GscData.query)
        .order_by(func.sum(GscData.clicks).desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return [
        GscQueryRow(
            query=r.query,
            clicks=int(r.clicks or 0),
            impressions=int(r.impressions or 0),
            ctr=float(r.ctr or 0),
            position=float(r.position or 0),
        )
        for r in result.all()
    ]


@router.get("/pages/{property_id}", response_model=List[GscPageRow])
async def get_pages(
    property_id: int,
    days: int = Query(28),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(
            GscData.page,
            func.sum(GscData.clicks).label("clicks"),
            func.sum(GscData.impressions).label("impressions"),
            func.avg(GscData.ctr).label("ctr"),
            func.avg(GscData.position).label("position"),
        )
        .where(GscData.property_id == property_id, GscData.date >= since, GscData.page.isnot(None))
        .group_by(GscData.page)
        .order_by(func.sum(GscData.clicks).desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return [
        GscPageRow(
            page=r.page,
            clicks=int(r.clicks or 0),
            impressions=int(r.impressions or 0),
            ctr=float(r.ctr or 0),
            position=float(r.position or 0),
        )
        for r in result.all()
    ]


@router.get("/devices/{property_id}")
async def get_devices(
    property_id: int,
    days: int = Query(28),
    db: AsyncSession = Depends(get_db),
):
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(
            GscData.device,
            func.sum(GscData.clicks).label("clicks"),
            func.sum(GscData.impressions).label("impressions"),
        )
        .where(GscData.property_id == property_id, GscData.date >= since)
        .group_by(GscData.device)
        .order_by(func.sum(GscData.clicks).desc())
    )
    return [{"device": r.device, "clicks": int(r.clicks or 0), "impressions": int(r.impressions or 0)} for r in result.all()]


@router.get("/countries/{property_id}")
async def get_countries(
    property_id: int,
    days: int = Query(28),
    db: AsyncSession = Depends(get_db),
):
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(
            GscData.country,
            func.sum(GscData.clicks).label("clicks"),
        )
        .where(GscData.property_id == property_id, GscData.date >= since)
        .group_by(GscData.country)
        .order_by(func.sum(GscData.clicks).desc())
        .limit(50)
    )
    return [{"country": r.country, "clicks": int(r.clicks or 0)} for r in result.all()]


@router.get("/cannibalization/{property_id}")
async def get_cannibalization(
    property_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(GscData.query, GscData.page)
        .where(GscData.property_id == property_id, GscData.query.isnot(None))
        .distinct()
    )
    rows = result.all()
    query_pages: dict = {}
    for row in rows:
        query_pages.setdefault(row.query, []).append(row.page)

    cannibal = [
        {"query": q, "pages": pages}
        for q, pages in query_pages.items()
        if len(pages) > 1
    ]
    return {"cannibalization": cannibal[:100]}


@router.get("/low-hanging-fruit/{property_id}", response_model=List[GscOpportunityKeyword])
async def get_low_hanging_fruit(
    property_id: int,
    min_position: float = Query(4.0),
    max_position: float = Query(20.0),
    min_impressions: int = Query(100),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    since = date.today() - timedelta(days=28)
    result = await db.execute(
        select(
            GscData.query,
            func.avg(GscData.position).label("position"),
            func.sum(GscData.impressions).label("impressions"),
            func.sum(GscData.clicks).label("clicks"),
            func.avg(GscData.ctr).label("ctr"),
        )
        .where(
            GscData.property_id == property_id,
            GscData.date >= since,
            GscData.query.isnot(None),
        )
        .group_by(GscData.query)
        .having(
            func.avg(GscData.position).between(min_position, max_position),
            func.sum(GscData.impressions) >= min_impressions,
        )
        .order_by(func.sum(GscData.impressions).desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return [
        GscOpportunityKeyword(
            query=r.query,
            position=float(r.position or 0),
            impressions=int(r.impressions or 0),
            clicks=int(r.clicks or 0),
            ctr=float(r.ctr or 0),
            potential_clicks=int((r.impressions or 0) * 0.05),
        )
        for r in result.all()
    ]


@router.get("/decay/{property_id}")
async def get_content_decay(
    property_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            GscData.page,
            GscData.date,
            func.sum(GscData.clicks).label("clicks"),
        )
        .where(GscData.property_id == property_id, GscData.page.isnot(None))
        .group_by(GscData.page, GscData.date)
        .order_by(GscData.page, GscData.date)
    )
    rows = result.all()

    page_data: dict = {}
    for row in rows:
        page_data.setdefault(row.page, []).append({"date": str(row.date), "clicks": int(row.clicks or 0)})

    decaying = []
    for page, data in page_data.items():
        if len(data) >= 2 and data[-1]["clicks"] < data[0]["clicks"] * 0.5:
            decaying.append({"page": page, "trend": data, "decay_pct": round((1 - data[-1]["clicks"] / max(data[0]["clicks"], 1)) * 100, 1)})

    return {"decaying_pages": decaying[:50]}


@router.get("/export/{property_id}")
async def export_gsc_data(
    property_id: int,
    days: int = Query(28),
    db: AsyncSession = Depends(get_db),
):
    import csv, io
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(GscData)
        .where(GscData.property_id == property_id, GscData.date >= since)
        .limit(10000)
    )
    rows = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["date", "query", "page", "clicks", "impressions", "ctr", "position", "device", "country"])
    for r in rows:
        writer.writerow([r.date, r.query, r.page, r.clicks, r.impressions, r.ctr, r.position, r.device, r.country])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=gsc_data.csv"},
    )
