from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.deps import get_db, PaginationParams
from app.db.models.social import SocialAccount, SocialPost, SocialMetric, Influencer
from app.schemas.social import SocialAccountCreate, SocialPostCreate, SocialPostUpdate

router = APIRouter()


@router.get("/accounts")
async def list_accounts(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(SocialAccount)
        .where(SocialAccount.project_id == project_id, SocialAccount.is_active == True)
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/accounts", status_code=201)
async def create_account(
    body: SocialAccountCreate,
    db: AsyncSession = Depends(get_db),
):
    account = SocialAccount(
        project_id=body.project_id,
        platform=body.platform,
        profile_data=body.profile_data,
    )
    db.add(account)
    await db.flush()
    await db.refresh(account)
    return account


@router.post("/accounts/connect", status_code=201)
async def connect_account_alias(
    body: SocialAccountCreate,
    db: AsyncSession = Depends(get_db),
):
    """Alias for POST /accounts (OAuth-style name for clients)."""
    account = SocialAccount(
        project_id=body.project_id,
        platform=body.platform,
        profile_data=body.profile_data,
    )
    db.add(account)
    await db.flush()
    await db.refresh(account)
    return account


@router.delete("/accounts/{account_id}", status_code=204)
async def delete_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SocialAccount).where(SocialAccount.id == account_id))
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.is_active = False


@router.get("/posts")
async def list_posts(
    project_id: int = Query(...),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(SocialPost).where(SocialPost.project_id == project_id)
    if status:
        stmt = stmt.where(SocialPost.status == status)
    stmt = stmt.order_by(SocialPost.created_at.desc()).offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


def _parse_scheduled_at(raw: Optional[str]) -> Optional[datetime]:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return None


@router.post("/posts", status_code=201)
async def create_post(
    body: SocialPostCreate,
    db: AsyncSession = Depends(get_db),
):
    ids = list(body.account_ids or [])
    if body.platforms and not ids:
        for plat in body.platforms:
            r = await db.execute(
                select(SocialAccount).where(
                    SocialAccount.project_id == body.project_id,
                    SocialAccount.platform == plat,
                    SocialAccount.is_active == True,
                )
            )
            acc = r.scalar_one_or_none()
            if acc:
                ids.append(acc.id)
    sched = _parse_scheduled_at(body.scheduled_at)
    post = SocialPost(
        project_id=body.project_id,
        content=body.content,
        account_ids=ids,
        status="scheduled" if sched else "draft",
        scheduled_at=sched,
    )
    db.add(post)
    await db.flush()
    await db.refresh(post)
    return post


@router.put("/posts/{post_id}")
async def update_post(
    post_id: int,
    body: SocialPostUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    if body.content is not None:
        post.content = body.content
    if body.status is not None:
        post.status = body.status
    await db.flush()
    await db.refresh(post)
    return post


@router.delete("/posts/{post_id}", status_code=204)
async def delete_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    await db.delete(post)


@router.post("/posts/{post_id}/publish", status_code=200)
async def publish_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SocialPost).where(SocialPost.id == post_id))
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")
    post.status = "published"
    post.published_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(post)
    return post


@router.get("/posts/{post_id}/metrics")
async def get_post_metrics(
    post_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SocialMetric).where(SocialMetric.post_id == post_id).order_by(SocialMetric.date.desc())
    )
    return result.scalars().all()


@router.get("/analytics")
async def social_analytics_summary(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(SocialPost).where(SocialPost.project_id == project_id))
    posts = result.scalars().all()
    published = [p for p in posts if p.status == "published"]
    return {
        "total_posts": len(posts),
        "published_posts": len(published),
        "top_posts": published[:10],
    }


@router.get("/calendar")
async def social_calendar(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SocialPost)
        .where(
            SocialPost.project_id == project_id,
            SocialPost.scheduled_at.isnot(None),
        )
        .order_by(SocialPost.scheduled_at.asc())
    )
    return result.scalars().all()


@router.get("/influencers")
async def list_influencers(
    project_id: int = Query(...),
    platform: Optional[str] = Query(None),
    niche: Optional[str] = Query(None, description="Ignored filter; reserved for future use"),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(Influencer).where(Influencer.project_id == project_id)
    if platform:
        stmt = stmt.where(Influencer.platform == platform)
    stmt = stmt.offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return {"influencers": rows}


@router.post("/influencers", status_code=201)
async def add_influencer(
    project_id: int = Query(...),
    platform: str = Query(...),
    username: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    influencer = Influencer(project_id=project_id, platform=platform, username=username)
    db.add(influencer)
    await db.flush()
    await db.refresh(influencer)
    return influencer
