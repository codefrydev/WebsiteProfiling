"""Portfolio item deletion (report_payload / crawl_runs)."""
from __future__ import annotations

from psycopg import Connection


def delete_portfolio_report(conn: Connection, report_id: int) -> bool:
    cur = conn.execute(
        "DELETE FROM report_payload WHERE id = %s RETURNING id",
        (report_id,),
    )
    deleted = cur.fetchone() is not None
    conn.commit()
    return deleted


def delete_portfolio_crawl_run(conn: Connection, crawl_run_id: int) -> bool:
    cur = conn.execute(
        "DELETE FROM crawl_runs WHERE id = %s RETURNING id",
        (crawl_run_id,),
    )
    deleted = cur.fetchone() is not None
    conn.commit()
    return deleted


def delete_portfolio_item(
    conn: Connection,
    *,
    report_id: int | None = None,
    crawl_run_id: int | None = None,
) -> None:
    if report_id is not None:
        delete_portfolio_report(conn, report_id)
    if crawl_run_id is not None:
        delete_portfolio_crawl_run(conn, crawl_run_id)
