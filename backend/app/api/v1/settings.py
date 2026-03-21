import csv
import io
import json
from enum import Enum
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_db, PaginationParams
from app.db.models.settings import AppSettings
from app.db.models.audit_log import AuditLog

router = APIRouter()


class SettingsExportFormat(str, Enum):
    json = "json"
    csv = "csv"


@router.get("/")
async def list_settings(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AppSettings))
    rows = result.scalars().all()
    return {row.key: row.value for row in rows}


@router.get("/export")
async def export_settings(
    format: SettingsExportFormat = Query(SettingsExportFormat.json),
    db: AsyncSession = Depends(get_db),
):
    """Download saved app settings (key/value rows) as a file in the browser."""
    result = await db.execute(select(AppSettings).order_by(AppSettings.key))
    rows = result.scalars().all()

    if format == SettingsExportFormat.csv:
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["key", "value"])
        for r in rows:
            writer.writerow([r.key, r.value if r.value is not None else ""])
        buf.seek(0)
        body = buf.getvalue()
        media = "text/csv; charset=utf-8"
        filename = "websiteprofiling-settings.csv"
    else:
        body = json.dumps({r.key: r.value for r in rows}, indent=2)
        media = "application/json; charset=utf-8"
        filename = "websiteprofiling-settings.json"

    return StreamingResponse(
        iter([body]),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/audit-log")
async def list_audit_log(
    db: AsyncSession = Depends(get_db),
    pagination: PaginationParams = Depends(),
):
    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    rows = result.scalars().all()
    return [
        {
            "id": r.id,
            "action": r.action,
            "resource_type": r.resource_type,
            "resource_id": r.resource_id,
            "details": r.details,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


@router.get("/{key}")
async def get_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    return {"key": setting.key, "value": setting.value}


@router.put("/{key}")
async def set_setting(
    key: str,
    value: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    setting = result.scalar_one_or_none()
    if setting:
        setting.value = value
    else:
        setting = AppSettings(key=key, value=value)
        db.add(setting)
    await db.flush()
    return {"key": key, "value": value}


@router.delete("/{key}", status_code=204)
async def delete_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(AppSettings).where(AppSettings.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail="Setting not found")
    await db.delete(setting)


@router.post("/bulk")
async def bulk_set_settings(
    settings_data: dict,
    db: AsyncSession = Depends(get_db),
):
    updated = []
    for key, value in settings_data.items():
        result = await db.execute(select(AppSettings).where(AppSettings.key == key))
        setting = result.scalar_one_or_none()
        if setting:
            setting.value = str(value) if value is not None else None
        else:
            setting = AppSettings(key=key, value=str(value) if value is not None else None)
            db.add(setting)
        updated.append(key)
    await db.flush()
    return {"updated": updated, "count": len(updated)}
