"""Report data loading helpers retained for Python tests and tooling.

Portfolio read routes (<c>/api/report/portfolio</c>) are served by the .NET Data service.
"""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from website_profiling.db._common import _row_field


# ── Report list ──────────────────────────────────────────────────────────────

def list_reports(conn: Connection) -> list[dict[str, Any]]:
    cur = conn.execute(
        "SELECT id, canonical_domain, site_name, generated_at FROM report_payload ORDER BY id DESC"
    )
    rows = cur.fetchall()
    result = []
    for row in rows:
        generated = _row_field(row, "generated_at")
        result.append({
            "id": int(_row_field(row, "id")),
            "canonical_domain": _row_field(row, "canonical_domain"),
            "site_name": _row_field(row, "site_name"),
            "generated_at": generated.isoformat() if hasattr(generated, "isoformat") else generated,
        })
    return result


def list_reports_latest_per_domain(conn: Connection) -> list[dict[str, Any]]:
    """One row per property — used by portfolio home grouping."""
    cur = conn.execute(
        """
        SELECT DISTINCT ON (COALESCE(NULLIF(canonical_domain, ''), site_name))
               id, canonical_domain, site_name, generated_at
        FROM report_payload
        ORDER BY COALESCE(NULLIF(canonical_domain, ''), site_name), generated_at DESC
        """
    )
    rows = cur.fetchall()
    result = []
    for row in rows:
        generated = _row_field(row, "generated_at")
        result.append({
            "id": int(_row_field(row, "id")),
            "canonical_domain": _row_field(row, "canonical_domain"),
            "site_name": _row_field(row, "site_name"),
            "generated_at": generated.isoformat() if hasattr(generated, "isoformat") else generated,
        })
    return result


# ── Crawl runs ───────────────────────────────────────────────────────────────

def list_crawl_runs(conn: Connection) -> list[dict[str, Any]]:
    try:
        cur = conn.execute(
            "SELECT id, start_url, created_at, render_mode, discovery_mode FROM crawl_runs ORDER BY id DESC"
        )
        rows = cur.fetchall()
    except Exception:
        return []
    result = []
    for row in rows:
        created = _row_field(row, "created_at")
        result.append({
            "id": int(_row_field(row, "id")),
            "start_url": str(_row_field(row, "start_url") or ""),
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
            "render_mode": _row_field(row, "render_mode"),
            "discovery_mode": _row_field(row, "discovery_mode"),
        })
    return result


def list_crawl_run_summaries(conn: Connection, *, max_runs: int | None = None) -> list[dict[str, Any]]:
    """Aggregate crawl run stats for portfolio cards and crawl history."""
    try:
        run_filter = ""
        params: tuple[Any, ...] = ()
        if max_runs is not None and max_runs > 0:
            run_filter = """
            WHERE cr.id IN (
                SELECT id FROM crawl_runs ORDER BY id DESC LIMIT %s
            )
            """
            params = (int(max_runs),)
        cur = conn.execute(
            f"""
            SELECT
               cr.id AS crawl_run_id,
               cr.start_url,
               cr.created_at,
               cr.render_mode,
               cr.discovery_mode,
               COUNT(crl.id)::int AS url_count,
               COUNT(*) FILTER (WHERE crl.status LIKE '2%%')::int AS s2xx,
               COUNT(*) FILTER (WHERE crl.status LIKE '3%%')::int AS s3xx,
               COUNT(*) FILTER (WHERE crl.status LIKE '4%%')::int AS s4xx,
               COUNT(*) FILTER (WHERE crl.status LIKE '5%%')::int AS s5xx,
               COUNT(*) FILTER (
                 WHERE crl.status IS NULL
                    OR crl.status = ''
                    OR crl.status !~ '^[2345]'
               )::int AS other,
               COUNT(*) FILTER (
                 WHERE NULLIF(TRIM(COALESCE(crl.title, crl.data->>'title', '')), '') IS NOT NULL
               )::int AS with_title,
               COALESCE(ROUND(AVG(NULLIF((crl.data->>'word_count')::numeric, 0))), 0)::int AS avg_word_count,
               COUNT(*) FILTER (
                 WHERE COALESCE((crl.data->>'word_count')::int, 0) > 0
                   AND COALESCE((crl.data->>'word_count')::int, 0) < 300
               )::int AS thin_pages
            FROM crawl_runs cr
            LEFT JOIN crawl_results crl ON crl.crawl_run_id = cr.id
            {run_filter}
            GROUP BY cr.id, cr.start_url, cr.created_at, cr.render_mode, cr.discovery_mode
            ORDER BY cr.id DESC
            """,
            params,
        )
        rows = cur.fetchall()
    except Exception:
        return []
    result = []
    for row in rows:
        created = _row_field(row, "created_at")
        result.append({
            "crawl_run_id": int(_row_field(row, "crawl_run_id")),
            "start_url": str(_row_field(row, "start_url") or ""),
            "created_at": created.isoformat() if hasattr(created, "isoformat") else str(created or ""),
            "url_count": int(_row_field(row, "url_count") or 0),
            "s2xx": int(_row_field(row, "s2xx") or 0),
            "s3xx": int(_row_field(row, "s3xx") or 0),
            "s4xx": int(_row_field(row, "s4xx") or 0),
            "s5xx": int(_row_field(row, "s5xx") or 0),
            "other": int(_row_field(row, "other") or 0),
            "with_title": int(_row_field(row, "with_title") or 0),
            "avg_word_count": int(_row_field(row, "avg_word_count") or 0),
            "thin_pages": int(_row_field(row, "thin_pages") or 0),
            "render_mode": _row_field(row, "render_mode"),
            "discovery_mode": _row_field(row, "discovery_mode"),
        })
    return result
