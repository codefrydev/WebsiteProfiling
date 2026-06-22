"""Portfolio report widget — GET /api/report/portfolio."""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection

from ..deps import get_db
from ..services.portfolio_loader import get_portfolio_response

router = APIRouter(prefix="/report", tags=["report-portfolio"])

DbDep = Annotated[Connection, Depends(get_db)]


@router.get("/portfolio")
def report_portfolio(
    conn: DbDep,
    widget: str = Query("full"),
    ids: Optional[str] = Query(None),
    reportId: Optional[int] = Query(None),
    crawlRunId: Optional[int] = Query(None),
) -> dict[str, Any]:
    """Return portfolio data — groups, crawl history, summary, or single card."""
    valid_widgets = {"full", "groups", "summary", "card"}
    if widget not in valid_widgets:
        raise HTTPException(status_code=400, detail="Invalid widget")

    if widget == "card" and reportId is None and crawlRunId is None:
        raise HTTPException(
            status_code=400, detail="reportId or crawlRunId required for card widget"
        )

    id_list: list[int] = []
    if ids:
        for s in ids.split(","):
            try:
                n = int(s.strip())
                if n > 0:
                    id_list.append(n)
            except ValueError:
                pass

    try:
        return get_portfolio_response(
            conn,
            widget=widget,
            ids=id_list,
            report_id=reportId,
            crawl_run_id=crawlRunId,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
