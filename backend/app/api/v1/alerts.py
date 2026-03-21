from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import delete, select

from app.core.deps import get_db, PaginationParams
from app.db.models.alerts import Alert, AlertHistory
from app.schemas.alerts import AlertCreate, AlertUpdate

router = APIRouter()


@router.get("/")
async def list_alerts(
    project_id: int = Query(...),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    stmt = select(Alert).where(Alert.project_id == project_id)
    if is_active is not None:
        stmt = stmt.where(Alert.is_active == is_active)
    stmt = stmt.offset(pagination.skip).limit(pagination.limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/", status_code=201)
async def create_alert(
    body: AlertCreate,
    db: AsyncSession = Depends(get_db),
):
    alert = Alert(
        project_id=body.project_id,
        name=body.name,
        type=body.type,
        config=body.config,
        channels=body.channels,
        is_active=body.is_active,
    )
    db.add(alert)
    await db.flush()
    await db.refresh(alert)
    return alert


@router.get("/history")
async def list_alerts_history(
    project_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(AlertHistory)
        .join(Alert, AlertHistory.alert_id == Alert.id)
        .where(Alert.project_id == project_id)
        .order_by(AlertHistory.triggered_at.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.get("/{alert_id}")
async def get_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.put("/{alert_id}")
async def update_alert(
    alert_id: int,
    body: AlertUpdate,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(alert, k, v)
    await db.flush()
    await db.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=204)
async def delete_alert(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    await db.execute(delete(AlertHistory).where(AlertHistory.alert_id == alert_id))
    await db.delete(alert)


@router.get("/{alert_id}/history")
async def get_alert_history(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(AlertHistory)
        .where(AlertHistory.alert_id == alert_id)
        .order_by(AlertHistory.triggered_at.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return result.scalars().all()


@router.post("/{alert_id}/test")
async def test_alert_delivery(
    alert_id: int,
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    import httpx

    from app.core.config import settings

    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    ch = alert.channels or {}
    webhook = (
        ch.get("slack_webhook")
        or ch.get("slack_webhook_url")
        or (ch.get("slack") if isinstance(ch.get("slack"), str) else None)
        or settings.SLACK_WEBHOOK_URL
    )
    channels_sent: dict = {}
    if webhook:
        try:
            async with httpx.AsyncClient() as client:
                r = await client.post(
                    webhook,
                    json={
                        "text": f"[Test] Alert *{alert.name}* (id {alert_id}) — delivery check from WebsiteProfiling.",
                    },
                    timeout=15.0,
                )
                channels_sent["slack"] = {"ok": r.is_success, "status_code": r.status_code}
        except Exception as e:
            channels_sent["slack"] = {"ok": False, "error": str(e)[:240]}

    row = AlertHistory(
        alert_id=alert_id,
        triggered_at=datetime.now(timezone.utc),
        data={"test_delivery": True, "alert_name": alert.name, "type": alert.type},
        channels_sent=channels_sent or None,
    )
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return {
        "status": "ok",
        "alert_id": alert_id,
        "history_id": row.id,
        "channels_sent": channels_sent,
    }
