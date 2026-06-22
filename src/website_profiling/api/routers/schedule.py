"""Scheduled crawl checks — /api/schedule/*."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["schedule"])


@router.post("/schedule/check")
def schedule_check() -> dict[str, Any]:
    try:
        from website_profiling.tools import schedule_runner

        result = schedule_runner.run()
        return result if isinstance(result, dict) else {"ok": True}
    except ImportError:
        pass
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"ok": True}
