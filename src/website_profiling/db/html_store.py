"""Per-URL raw HTML storage for crawl runs."""
from __future__ import annotations

from typing import Any, Iterator, Optional

from psycopg import Connection

from ._common import _executemany, _now_iso

_HTML_BATCH_SIZE = 200

_HTML_UPSERT_SQL = """INSERT INTO crawl_page_html (
    crawl_run_id, url, html, status, content_type, fetch_method, byte_length, captured_at
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT (crawl_run_id, url) DO UPDATE SET
    html = EXCLUDED.html,
    status = EXCLUDED.status,
    content_type = EXCLUDED.content_type,
    fetch_method = EXCLUDED.fetch_method,
    byte_length = EXCLUDED.byte_length,
    captured_at = EXCLUDED.captured_at"""


def _normalize_url(url: str) -> str:
    return str(url or "").rstrip("/")


def _rows_from_records(records: list[dict[str, Any]], crawl_run_id: int) -> list[tuple]:
    rows: list[tuple] = []
    captured_at = _now_iso()
    for rec in records:
        url = _normalize_url(str(rec.get("url") or ""))
        html = rec.get("html")
        if not url or not html:
            continue
        status = str(rec.get("status") or "") if rec.get("status") is not None else None
        content_type = str(rec.get("content_type") or "") if rec.get("content_type") is not None else None
        fetch_method = str(rec.get("fetch_method") or "static").strip() or "static"
        byte_length = int(rec.get("byte_length") or len(str(html).encode("utf-8")))
        rows.append(
            (crawl_run_id, url, str(html), status, content_type, fetch_method, byte_length, captured_at)
        )
    return rows


def write_page_html_batch(
    conn: Connection,
    records: list[dict[str, Any]],
    crawl_run_id: int,
    *,
    commit: bool = True,
) -> None:
    """Upsert HTML rows for a crawl run (each record: url, html, status, content_type, fetch_method, byte_length)."""
    rows = _rows_from_records(records, crawl_run_id)
    if not rows:
        return
    _executemany(conn, _HTML_UPSERT_SQL, rows, page_size=_HTML_BATCH_SIZE)
    if commit:
        conn.commit()


def read_page_html(conn: Connection, crawl_run_id: int, url: str) -> Optional[dict[str, Any]]:
    """Return stored HTML and metadata for one URL, or None."""
    norm = _normalize_url(url)
    if not norm:
        return None
    try:
        cur = conn.execute(
            """SELECT url, html, status, content_type, fetch_method, byte_length, captured_at
               FROM crawl_page_html
               WHERE crawl_run_id = %s AND url = %s""",
            (crawl_run_id, norm),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return dict(row)
    except Exception:
        return None


def read_page_html_for_run(
    conn: Connection,
    crawl_run_id: int,
    *,
    limit: int = 5000,
    offset: int = 0,
) -> Iterator[dict[str, Any]]:
    """Yield stored HTML rows for a crawl run (paginated)."""
    try:
        cur = conn.execute(
            """SELECT url, html, status, content_type, fetch_method, byte_length, captured_at
               FROM crawl_page_html
               WHERE crawl_run_id = %s
               ORDER BY url
               LIMIT %s OFFSET %s""",
            (crawl_run_id, max(1, int(limit)), max(0, int(offset))),
        )
        for row in cur.fetchall():
            yield dict(row)
    except Exception:
        return


def delete_page_html_for_run(conn: Connection, crawl_run_id: int, *, commit: bool = True) -> None:
    """Delete all stored HTML for a crawl run."""
    try:
        conn.execute("DELETE FROM crawl_page_html WHERE crawl_run_id = %s", (crawl_run_id,))
        if commit:
            conn.commit()
    except Exception:
        pass
