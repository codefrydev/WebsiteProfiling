"""Keywords routers — /api/keywords/*."""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException

from ..deps import get_db
from psycopg import Connection

router = APIRouter(prefix="/keywords", tags=["keywords"])

DbDep = Annotated[Connection, Depends(get_db)]


# ── POST /api/keywords/competitor-import ──────────────────────────────────────

@router.post("/competitor-import")
def keywords_competitor_import(
    conn: DbDep,
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    property_id = int(body.get("propertyId") or 0)
    competitor = str(body.get("competitor") or "").strip()
    csv_text = str(body.get("csvText") or "")

    if not property_id or not competitor or not csv_text.strip():
        raise HTTPException(
            status_code=400,
            detail="propertyId, competitor, and csvText required",
        )

    try:
        from website_profiling.integrations.keywords.competitor_csv import (  # type: ignore[import]
            parse_competitor_keyword_csv,
        )
        from website_profiling.integrations.keywords.competitor_gap_store import (  # type: ignore[import]
            merge_competitor_keyword_import,
        )

        rows = parse_competitor_keyword_csv(csv_text, competitor=competitor)
        merged = merge_competitor_keyword_import(conn, property_id, competitor, rows)
        return {
            "count": len(rows),
            "rows": rows[:500],
            "mergedCount": len(merged),
            "mergedRows": merged[:500],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Competitor keyword import failed: {exc}")


# ── POST /api/keywords/content-brief ─────────────────────────────────────────

@router.post("/content-brief")
def keywords_content_brief(
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    keyword = str(body.get("keyword") or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword required")

    rows = body.get("rows") or []
    gaps = body.get("gaps") or []

    try:
        from website_profiling.llm.content_brief import generate_content_brief  # type: ignore[import]

        brief = generate_content_brief(keyword, rows, gaps)
        return {"brief": brief}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Content brief generation failed: {exc}")
