"""Per-URL markdown storage for crawl runs (crawl_page_markdown table)."""
from __future__ import annotations

from typing import Any, Optional

from psycopg import Connection

from ._common import _executemany, _now_iso, _row_field

_MD_BATCH_SIZE = 200

_MD_UPSERT_SQL = """INSERT INTO crawl_page_markdown (
    crawl_run_id, url, property_id, title, markdown, word_count, strategy, source_byte_length, extracted_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (crawl_run_id, url) DO UPDATE SET
    property_id = EXCLUDED.property_id,
    title = EXCLUDED.title,
    markdown = EXCLUDED.markdown,
    word_count = EXCLUDED.word_count,
    strategy = EXCLUDED.strategy,
    source_byte_length = EXCLUDED.source_byte_length,
    extracted_at = EXCLUDED.extracted_at"""


def _normalize_url(url: str) -> str:
    return str(url or "")


def write_page_markdown_batch(
    conn: Connection,
    records: list[dict[str, Any]],
    crawl_run_id: int,
    property_id: Optional[int] = None,
    *,
    commit: bool = True,
) -> None:
    """Upsert markdown rows for a crawl run."""
    rows: list[tuple] = []
    extracted_at = _now_iso()
    for rec in records:
        url = _normalize_url(str(rec.get("url") or ""))
        markdown = rec.get("markdown")
        if not url or not markdown:
            continue
        title = str(rec.get("title") or "") or None
        word_count = int(rec.get("word_count") or 0)
        strategy = str(rec.get("strategy") or "main_only")
        source_byte_length = int(rec.get("source_byte_length") or 0)
        rows.append(
            (crawl_run_id, url, property_id, title, str(markdown), word_count, strategy, source_byte_length, extracted_at)
        )
    if not rows:
        return
    _executemany(conn, _MD_UPSERT_SQL, rows, page_size=_MD_BATCH_SIZE)
    if commit:
        conn.commit()


def read_page_markdown(conn: Connection, crawl_run_id: int, url: str) -> Optional[dict[str, Any]]:
    """Return stored markdown and metadata for one URL, or None."""
    norm = _normalize_url(url)
    if not norm:
        return None
    try:
        cur = conn.execute(
            """SELECT url, title, markdown, word_count, strategy, source_byte_length, extracted_at
               FROM crawl_page_markdown
               WHERE crawl_run_id = %s AND url = %s""",
            (crawl_run_id, norm),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return {
            "url": _row_field(row, "url"),
            "title": _row_field(row, "title"),
            "markdown": _row_field(row, "markdown"),
            "word_count": _row_field(row, "word_count"),
            "strategy": _row_field(row, "strategy"),
            "source_byte_length": _row_field(row, "source_byte_length"),
            "extracted_at": _row_field(row, "extracted_at"),
        }
    except Exception:
        return None


def list_page_markdown(
    conn: Connection,
    crawl_run_id: int,
    *,
    limit: int = 25,
    offset: int = 0,
    query: str = "",
) -> dict[str, Any]:
    """Return a paginated list of markdown rows for a crawl run plus total count."""
    limit = max(1, min(200, int(limit)))
    offset = max(0, int(offset))
    q = (query or "").strip()
    try:
        if q:
            pattern = f"%{q.lower()}%"
            count_cur = conn.execute(
                """SELECT COUNT(*) FROM crawl_page_markdown
                   WHERE crawl_run_id = %s AND lower(url) LIKE %s""",
                (crawl_run_id, pattern),
            )
            total_row = count_cur.fetchone()
            total = int(_row_field(total_row, "count", index=0) or 0) if total_row else 0

            cur = conn.execute(
                """SELECT url, title, word_count, strategy, extracted_at
                   FROM crawl_page_markdown
                   WHERE crawl_run_id = %s AND lower(url) LIKE %s
                   ORDER BY url
                   LIMIT %s OFFSET %s""",
                (crawl_run_id, pattern, limit, offset),
            )
        else:
            count_cur = conn.execute(
                "SELECT COUNT(*) FROM crawl_page_markdown WHERE crawl_run_id = %s",
                (crawl_run_id,),
            )
            total_row = count_cur.fetchone()
            total = int(_row_field(total_row, "count", index=0) or 0) if total_row else 0

            cur = conn.execute(
                """SELECT url, title, word_count, strategy, extracted_at
                   FROM crawl_page_markdown
                   WHERE crawl_run_id = %s
                   ORDER BY url
                   LIMIT %s OFFSET %s""",
                (crawl_run_id, limit, offset),
            )
        items = [
            {
                "url": _row_field(row, "url"),
                "title": _row_field(row, "title"),
                "word_count": _row_field(row, "word_count"),
                "strategy": _row_field(row, "strategy"),
                "extracted_at": _row_field(row, "extracted_at"),
            }
            for row in cur.fetchall() or []
        ]
        return {"items": items, "total": total, "limit": limit, "offset": offset}
    except Exception:
        return {"items": [], "total": 0, "limit": limit, "offset": offset}


def count_page_markdown_by_run(conn: Connection, crawl_run_ids: list[int]) -> dict[int, int]:
    """Return a mapping of crawl_run_id → markdown page count for the given run ids."""
    if not crawl_run_ids:
        return {}
    try:
        cur = conn.execute(
            """SELECT crawl_run_id, COUNT(*)::int AS cnt
               FROM crawl_page_markdown
               WHERE crawl_run_id = ANY(%s::bigint[])
               GROUP BY crawl_run_id""",
            (crawl_run_ids,),
        )
        return {
            int(_row_field(row, "crawl_run_id")): int(_row_field(row, "cnt") or 0)
            for row in cur.fetchall() or []
        }
    except Exception:
        return {}


def delete_page_markdown_for_run(conn: Connection, crawl_run_id: int, *, commit: bool = True) -> int:
    """Delete all extracted markdown for a crawl run; returns deleted row count."""
    try:
        cur = conn.execute(
            "DELETE FROM crawl_page_markdown WHERE crawl_run_id = %s",
            (crawl_run_id,),
        )
        deleted = cur.rowcount or 0
        if commit:
            conn.commit()
        return deleted
    except Exception:
        return 0


def list_markdown_crawl_runs(
    conn: Connection,
    property_id: int | None = None,
    *,
    limit: int = 50,
) -> list[dict[str, Any]]:
    """Crawl runs with HTML and markdown page counts for the page-markdown UI."""
    limit = max(1, min(int(limit), 100))
    where = "WHERE cr.property_id = %s" if property_id else ""
    params: tuple[Any, ...] = (property_id, limit) if property_id else (limit,)
    cur = conn.execute(
        f"""
        SELECT cr.id, cr.created_at, cr.start_url,
               COALESCE(html_counts.cnt, 0) AS html_page_count,
               COALESCE(md_counts.cnt, 0)   AS markdown_page_count
        FROM crawl_runs cr
        LEFT JOIN (
            SELECT crawl_run_id, COUNT(*)::int AS cnt
            FROM crawl_page_html GROUP BY crawl_run_id
        ) html_counts ON html_counts.crawl_run_id = cr.id
        LEFT JOIN (
            SELECT crawl_run_id, COUNT(*)::int AS cnt
            FROM crawl_page_markdown GROUP BY crawl_run_id
        ) md_counts ON md_counts.crawl_run_id = cr.id
        {where}
        ORDER BY cr.id DESC
        LIMIT %s
        """,
        params,
    )
    runs: list[dict[str, Any]] = []
    for row in cur.fetchall() or []:
        created = _row_field(row, "created_at")
        runs.append({
            "id": int(_row_field(row, "id")),
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created or "") or None,
            "start_url": _row_field(row, "start_url"),
            "html_page_count": int(_row_field(row, "html_page_count") or 0),
            "markdown_page_count": int(_row_field(row, "markdown_page_count") or 0),
        })
    return runs

