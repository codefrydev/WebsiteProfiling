from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, PaginationParams
from app.db.models.jobs import Job

router = APIRouter()


@router.get("/")
async def list_jobs(
    project_id: Optional[int] = Query(None),
    type: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(Job)
    if project_id is not None:
        stmt = stmt.where(Job.project_id == project_id)
    if type is not None:
        stmt = stmt.where(Job.type == type)
    if status is not None:
        stmt = stmt.where(Job.status == status)
    stmt = stmt.order_by(Job.created_at.desc()).offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{job_id}")
async def get_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/{job_id}", status_code=204)
async def cancel_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status in ("pending", "running"):
        job.status = "cancelled"
    else:
        raise HTTPException(status_code=400, detail=f"Cannot cancel job in status: {job.status}")


@router.post("/{job_id}/retry")
async def retry_job(
    job_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Job).where(Job.id == job_id))
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.status not in ("failed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"Cannot retry job in status: {job.status}")
    job.status = "pending"
    job.error = None
    job.progress = 0
    await db.flush()
    await db.refresh(job)
    return job
