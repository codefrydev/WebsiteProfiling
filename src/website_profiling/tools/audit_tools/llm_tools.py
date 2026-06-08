"""LLM and cross-property tool wrappers."""
from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

from ...db._common import _row_field
from ...db.property_store import list_properties_public
from ...integrations.google.suggest import batch_expand
from ...llm.content_brief import generate_content_brief as build_content_brief
from ...llm.page_coach import run_page_coach
from ._slice import parse_limit
from .context import AuditToolContext


def generate_content_brief(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    keyword = str(args.get("keyword") or "").strip()
    if not keyword:
        return {"error": "keyword is required"}
    rows: list[dict[str, Any]] = []
    if scoped.property_id is not None:
        kw_data = scoped.load_keywords(conn)
        if isinstance(kw_data, dict):
            all_rows = kw_data.get("rows") or []
            if isinstance(all_rows, list):
                needle = keyword.lower()
                rows = [
                    r for r in all_rows
                    if isinstance(r, dict) and needle in str(r.get("keyword") or "").lower()
                ]
    gaps_raw = args.get("gaps")
    gaps = [str(g) for g in gaps_raw if g] if isinstance(gaps_raw, list) else None
    brief = build_content_brief(keyword, rows, gaps, use_llm=False)
    return {"brief": brief, "keyword": keyword, "matched_rows": len(rows)}


def get_page_coach(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required"}
    refresh = str(args.get("refresh") or "").lower() in ("true", "1", "yes")
    result = run_page_coach(
        url,
        refresh=refresh,
        current_id=scoped.report_id,
    )
    return result


def get_portfolio_summary(conn: Connection, _ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    limit = parse_limit(args.get("limit"), 50, 100)
    props = list_properties_public(conn)
    summaries: list[dict[str, Any]] = []
    for prop in props[:limit]:
        if not isinstance(prop, dict):
            continue
        pid = prop.get("id")
        if pid is None:
            continue
        cur = conn.execute(
            """SELECT health_score, generated_at, report_id, issue_counts
               FROM audit_health_snapshots
               WHERE property_id = %s
               ORDER BY generated_at DESC, id DESC
               LIMIT 1""",
            (int(pid),),
        )
        row = cur.fetchone()
        issue_counts = None
        health_score = None
        generated_at = None
        report_id = None
        if row:
            health_score = _row_field(row, "health_score", index=0)
            generated_at = _row_field(row, "generated_at", index=1)
            report_id = _row_field(row, "report_id", index=2)
            raw_counts = _row_field(row, "issue_counts", index=3)
            if isinstance(raw_counts, str):
                try:
                    issue_counts = json.loads(raw_counts)
                except json.JSONDecodeError:
                    issue_counts = {}
            elif isinstance(raw_counts, dict):
                issue_counts = raw_counts
        summaries.append({
            "property_id": pid,
            "name": prop.get("name"),
            "canonical_domain": prop.get("canonical_domain"),
            "health_score": health_score,
            "report_id": report_id,
            "generated_at": generated_at.isoformat() if hasattr(generated_at, "isoformat") else str(generated_at or ""),
            "issue_counts": issue_counts,
        })
    scores = [s["health_score"] for s in summaries if isinstance(s.get("health_score"), (int, float))]
    median = None
    if scores:
        ordered = sorted(scores)
        mid = len(ordered) // 2
        median = ordered[mid] if len(ordered) % 2 else (ordered[mid - 1] + ordered[mid]) / 2
    return {"properties": summaries, "count": len(summaries), "median_health_score": median}


def expand_keywords(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    seeds_raw = args.get("seeds")
    if isinstance(seeds_raw, str):
        seeds = [s.strip() for s in seeds_raw.split(",") if s.strip()]
    elif isinstance(seeds_raw, list):
        seeds = [str(s).strip() for s in seeds_raw if str(s).strip()]
    else:
        return {"error": "seeds is required (list or comma-separated string)"}
    if not seeds:
        return {"error": "seeds is required"}
    seeds = seeds[:30]
    sources_raw = args.get("sources")
    if isinstance(sources_raw, list):
        sources = tuple(str(s).strip() for s in sources_raw if str(s).strip())
    else:
        sources = ("web", "youtube", "questions")
    expanded = batch_expand(seeds, sources=sources, cache_conn=conn)
    return {
        "property_id": scoped.property_id,
        "seeds": seeds,
        "expansions": expanded,
        "seed_count": len(seeds),
    }
