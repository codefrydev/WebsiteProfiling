"""Report data loading service — DB queries for the /api/report/* routes."""
from __future__ import annotations

from typing import Any, Optional

from psycopg import Connection

from website_profiling.db._common import _parse_row_json, _row_field
from website_profiling.db.report_store import read_report_payload

# ── Section slicing ─────────────────────────────────────────────────────────

SECTION_FIELDS: dict[str, list[str]] = {
    "core": [
        "site_name", "summary", "categories", "top_pages", "recommendations",
        "seo_health", "social_coverage", "status_counts", "portfolio_benchmark",
        "executive_summary", "crux_summary", "report_meta", "report_generated_at",
        "crawl_only_preview", "crawl_run_id", "crawl_run_created_at", "site_level",
        "ml_errors",
    ],
    "links": [
        "links", "link_edges", "link_rel_summary", "inlink_anchor_matrix",
        "outbound_link_domains", "outlink_labels", "outlink_counts",
    ],
    "traffic": ["google"],
    "keywords": [
        "keywords", "keyword_opportunities", "competitor_keyword_gap",
        "semantic_keyword_clusters",
    ],
    "issues": ["issues", "redirects"],
    "content": [
        "content_urls", "content_duplicates", "content_analytics",
        "text_content_analysis", "response_time_stats",
    ],
    "lighthouse": [
        "lighthouse_summary", "lighthouse_by_url", "lighthouse_diagnostics",
        "lighthouse_human_summary",
    ],
    "security": ["security_findings"],
    "gsc-links": ["gsc_links", "bing_backlinks"],
    "structure": ["graph_nodes", "graph_edges", "depth_distribution"],
    "tech": ["tech_stack_summary", "subdomains", "contact_intelligence"],
    "indexation": [
        "indexation_coverage", "hreflang_summary", "ner_site_summary",
        "language_summary", "rich_results_validation", "url_fingerprints",
        "rich_results_meta",
    ],
    "gallery": [
        "mime_labels", "mime_values", "title_labels", "title_counts",
        "domain_labels", "domain_values",
    ],
}

SECTION_KEYS = list(SECTION_FIELDS.keys())


def slice_payload_for_section(
    payload: dict[str, Any], section: str
) -> dict[str, Any]:
    fields = SECTION_FIELDS.get(section, [])
    return {k: payload[k] for k in fields if k in payload}


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
    """One row per property — enough for portfolio home grouping (avoids loading every historical report)."""
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


# ── Report payload ───────────────────────────────────────────────────────────

def get_report_payload(
    conn: Connection,
    report_id: Optional[int] = None,
    domain: Optional[str] = None,
    section: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    resolved_id = report_id

    if resolved_id is None and domain:
        domain_lower = domain.strip().lower()
        reports = list_reports(conn)
        match = next(
            (r for r in reports if (r.get("canonical_domain") or "").lower() == domain_lower),
            None,
        )
        if match:
            resolved_id = match["id"]

    payload = read_report_payload(conn, resolved_id)
    if payload is None:
        return None

    if section and section in SECTION_FIELDS:
        return slice_payload_for_section(payload, section)
    return payload


# ── Crawl preview ────────────────────────────────────────────────────────────

def get_crawl_preview_payload(conn: Connection, crawl_run_id: int) -> dict[str, Any]:
    cur = conn.execute(
        "SELECT id, start_url, created_at FROM crawl_runs WHERE id = %s",
        (crawl_run_id,),
    )
    run_row = cur.fetchone()
    if not run_row:
        raise ValueError("Crawl run not found")

    start_url = str(_row_field(run_row, "start_url") or "")
    from urllib.parse import urlparse
    try:
        site_host = urlparse(start_url).hostname or ""
    except Exception:
        site_host = ""

    cur2 = conn.execute(
        "SELECT url, data FROM crawl_results WHERE crawl_run_id = %s",
        (crawl_run_id,),
    )
    pages = []
    for row in cur2.fetchall():
        data = _parse_row_json(row, "data", index=1)
        if not isinstance(data, dict):
            data = {}
        pages.append({"url": str(_row_field(row, "url") or ""), **data})

    return {
        "crawl_only_preview": True,
        "crawl_run_id": crawl_run_id,
        "site_name": site_host,
        "top_pages": pages,
    }


# ── Audit history ────────────────────────────────────────────────────────────

def _avg_score(categories: list[dict[str, Any]]) -> Optional[int]:
    nums = [float(c["score"]) for c in categories if isinstance(c.get("score"), (int, float))]
    if not nums:
        return None
    return round(sum(nums) / len(nums))


def _issue_counts(categories: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0}
    for cat in categories:
        for issue in (cat.get("issues") or []):
            p = str(issue.get("priority") or "Medium")
            counts[p] = counts.get(p, 0) + 1
    return counts


def _lh_scores(payload: dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
    summary = payload.get("lighthouse_summary")
    if not isinstance(summary, dict):
        return None, None
    mm = summary.get("median_metrics") or {}
    cs = summary.get("category_scores") or {}
    perf_raw = mm.get("performance_score") or cs.get("performance")
    seo_raw = mm.get("seo_score") or cs.get("seo")
    perf = round(float(perf_raw)) if isinstance(perf_raw, (int, float)) else None
    seo = round(float(seo_raw)) if isinstance(seo_raw, (int, float)) else None
    return perf, seo


def list_audit_history(
    conn: Connection,
    property_id: Optional[int] = None,
    domain: Optional[str] = None,
    limit: int = 20,
) -> list[dict[str, Any]]:
    clauses: list[str] = []
    vals: list[Any] = []

    if property_id is not None and property_id > 0:
        clauses.append("property_id = %s")
        vals.append(property_id)
    elif domain:
        normalized = domain.strip().lower()
        clauses.append(
            "(LOWER(canonical_domain) = %s OR regexp_replace(LOWER(COALESCE(canonical_domain, '')), '[^a-z0-9]+', '-', 'g') = %s)"
        )
        vals.append(normalized)
        vals.append(normalized)

    limit = max(1, min(100, limit))
    vals.append(limit)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""

    cur = conn.execute(
        f"""SELECT id, canonical_domain, site_name, generated_at, data
            FROM report_payload {where}
            ORDER BY generated_at DESC LIMIT %s""",
        vals,
    )
    rows = cur.fetchall()
    result = []
    for row in rows:
        data = _parse_row_json(row, "data")
        if not isinstance(data, dict):
            data = {}
        categories = data.get("categories") or []
        cat_scores = {
            (c.get("id") or c.get("name") or "unknown"): float(c["score"])
            for c in categories
            if isinstance(c.get("score"), (int, float))
        }
        perf, seo = _lh_scores(data)
        tech_seo_cat = next((c for c in categories if c.get("id") == "technical_seo"), None)
        tech_seo = round(float(tech_seo_cat["score"])) if tech_seo_cat and isinstance(tech_seo_cat.get("score"), (int, float)) else None
        generated_at = _row_field(row, "generated_at")
        result.append({
            "reportId": int(_row_field(row, "id")),
            "canonicalDomain": _row_field(row, "canonical_domain"),
            "siteName": _row_field(row, "site_name"),
            "generatedAt": generated_at.isoformat() if hasattr(generated_at, "isoformat") else generated_at,
            "healthScore": _avg_score(categories),
            "categoryScores": cat_scores,
            "issueCounts": _issue_counts(categories),
            "perfScore": perf,
            "seoScore": seo,
            "technicalSeoScore": tech_seo,
        })
    return result


# ── Mobile-desktop delta ─────────────────────────────────────────────────────

def get_mobile_desktop_delta(conn: Connection, run_id: int) -> list[dict[str, Any]]:
    cur = conn.execute(
        "SELECT mobile_run_id FROM crawl_runs WHERE id = %s", (run_id,)
    )
    row = cur.fetchone()
    mobile_run_id = _row_field(row, "mobile_run_id")
    if not row or mobile_run_id is None:
        return []
    mobile_run_id = int(mobile_run_id)

    def fetch_run(rid: int) -> dict[str, dict[str, Any]]:
        c = conn.execute(
            "SELECT url, data FROM crawl_results WHERE crawl_run_id = %s", (rid,)
        )
        m: dict[str, dict[str, Any]] = {}
        for r in c.fetchall():
            d = _parse_row_json(r, "data", index=1)
            if not isinstance(d, dict):
                d = {}
            key = str(_row_field(r, "url") or "").rstrip("/").lower()
            m[key] = {
                "title": str(d.get("title") or ""),
                "h1": str(d.get("h1") or ""),
                "word_count": int(d.get("word_count") or 0),
                "status": int(d.get("status") or 0),
            }
        return m

    desktop_map = fetch_run(run_id)
    mobile_map = fetch_run(mobile_run_id)

    deltas = []
    for key, desktop in desktop_map.items():
        mobile = mobile_map.get(key)
        if not mobile:
            continue
        title_differs = desktop["title"] != mobile["title"]
        h1_differs = desktop["h1"] != mobile["h1"]
        word_count_delta = abs(desktop["word_count"] - mobile["word_count"])
        status_differs = desktop["status"] != mobile["status"]
        if not title_differs and not h1_differs and word_count_delta <= 50 and not status_differs:
            continue
        deltas.append({
            "url": key,
            "desktop": desktop,
            "mobile": mobile,
            "title_differs": title_differs,
            "h1_differs": h1_differs,
            "word_count_delta": word_count_delta,
            "status_differs": status_differs,
        })

    deltas.sort(
        key=lambda d: (d["status_differs"] * 4 + d["title_differs"] * 2 + d["h1_differs"]),
        reverse=True,
    )
    return deltas
