"""Portfolio item deletion — /api/portfolio/*."""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException
from psycopg import Connection
from pydantic import BaseModel

from ..deps import get_db
from website_profiling.db import portfolio_store

router = APIRouter(tags=["portfolio"])

DbDep = Annotated[Connection, Depends(get_db)]


class DeletePortfolioBody(BaseModel):
    reportId: Optional[int] = None
    crawlRunId: Optional[int] = None


@router.delete("/portfolio/delete")
def delete_portfolio_item(body: DeletePortfolioBody, conn: DbDep) -> dict[str, Any]:
    if body.reportId is None and body.crawlRunId is None:
        raise HTTPException(status_code=400, detail="reportId or crawlRunId required")

    portfolio_store.delete_portfolio_item(
        conn,
        report_id=body.reportId,
        crawl_run_id=body.crawlRunId,
    )
    return {"ok": True}
