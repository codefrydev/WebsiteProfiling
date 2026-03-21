from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, PaginationParams
from app.db.models.jobs import Job

router = APIRouter()


@router.get("/projects")
async def list_audit_projects(
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(Job)
        .where(Job.type == "site_audit")
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    jobs = result.scalars().all()
    return {"total": len(jobs), "items": jobs}


@router.post("/projects")
async def create_audit_project(
    project_id: int = Query(...),
    url: str = Query(...),
    max_pages: int = Query(500),
    db: AsyncSession = Depends(get_db),
):
    job = Job(
        project_id=project_id,
        type="site_audit",
        status="pending",
        result={"url": url, "max_pages": max_pages},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "status": "queued"}


@router.get("/projects/{audit_id}")
async def get_audit_project(
    audit_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == audit_id, Job.type == "site_audit"))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Audit project not found")
    return job


@router.get("/issues")
async def list_issues(
    audit_id: int = Query(...),
    severity: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(select(Job).where(Job.id == audit_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Audit not found")

    issues = (job.result or {}).get("issues", [])
    if severity:
        issues = [i for i in issues if i.get("severity") == severity]
    if category:
        issues = [i for i in issues if i.get("category") == category]

    total = len(issues)
    paged = issues[pagination.skip:pagination.skip + pagination.limit]
    return {"total": total, "items": paged}


@router.get("/issues/summary")
async def issues_summary(
    audit_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == audit_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Audit not found")

    issues = (job.result or {}).get("issues", [])
    summary: dict = {}
    for issue in issues:
        cat = issue.get("category", "other")
        sev = issue.get("severity", "info")
        summary.setdefault(cat, {}).setdefault(sev, 0)
        summary[cat][sev] += 1

    return {"summary": summary, "total": len(issues)}


@router.get("/crawls")
async def list_crawls(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(Job)
        .where(Job.project_id == project_id, Job.type == "site_audit")
        .order_by(Job.created_at.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/crawls/compare")
async def compare_crawls(
    crawl_id_1: int = Query(...),
    crawl_id_2: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    r1 = await db.execute(select(Job).where(Job.id == crawl_id_1))
    r2 = await db.execute(select(Job).where(Job.id == crawl_id_2))
    j1, j2 = r1.scalar_one_or_none(), r2.scalar_one_or_none()
    if not j1 or not j2:
        raise HTTPException(status_code=404, detail="One or both crawls not found")

    issues1 = set(i.get("url") for i in (j1.result or {}).get("issues", []))
    issues2 = set(i.get("url") for i in (j2.result or {}).get("issues", []))

    return {
        "new_issues": list(issues2 - issues1),
        "fixed_issues": list(issues1 - issues2),
        "common_issues": list(issues1 & issues2),
    }


@router.post("/crawls/start")
async def start_crawl(
    project_id: int = Query(...),
    url: str = Query(...),
    max_pages: int = Query(500),
    db: AsyncSession = Depends(get_db),
):
    job = Job(
        project_id=project_id,
        type="site_audit",
        status="pending",
        result={"url": url, "max_pages": max_pages},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "status": "queued"}


@router.get("/sitemap")
async def generate_sitemap(
    audit_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == audit_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Audit not found")

    pages = (job.result or {}).get("pages", [])
    urls = [p.get("url") for p in pages if p.get("status") == 200]
    return {"urls": urls, "count": len(urls)}


@router.post("/log-file")
async def upload_log_file(
    project_id: int = Query(...),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    lines = content.decode("utf-8", errors="replace").splitlines()

    job = Job(
        project_id=project_id,
        type="log_analysis",
        status="pending",
        result={"filename": file.filename, "lines": len(lines)},
    )
    db.add(job)
    await db.flush()
    await db.refresh(job)
    return {"job_id": job.id, "lines_parsed": len(lines)}


@router.get("/custom-extraction")
async def custom_extraction(
    audit_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == audit_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Audit not found")

    extractions = (job.result or {}).get("custom_extractions", [])
    return {"extractions": extractions}
