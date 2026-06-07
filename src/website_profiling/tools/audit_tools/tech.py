"""Technology stack tools."""
from __future__ import annotations

import json
from typing import Any

from psycopg import Connection

from .context import AuditToolContext
from ._slice import cap_list, parse_limit, payload_dict_slice


def get_tech_stack_summary(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found"}
    return payload_dict_slice(payload, "tech_stack_summary")


def list_pages_by_technology(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    tech_name = str(args.get("technology_name") or "").strip().lower()
    if not tech_name:
        return {"error": "technology_name is required", "pages": [], "total": 0, "truncated": False}
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "pages": [], "total": 0, "truncated": False}
    limit = parse_limit(args.get("limit"), 30, 50)
    pages: list[dict[str, Any]] = []
    summary = payload.get("tech_stack_summary") or {}
    if isinstance(summary, dict):
        for entry in summary.get("technologies") or []:
            if not isinstance(entry, dict):
                continue
            if str(entry.get("name") or "").lower() == tech_name:
                for url in entry.get("sample_urls") or []:
                    pages.append({"url": url, "technology": entry.get("name")})
                break
    if not pages:
        df = scoped.load_crawl_df(conn)
        if df is not None and not df.empty and "tech_stack" in df.columns:
            for _, row in df.iterrows():
                raw = row.get("tech_stack") or "[]"
                try:
                    techs = json.loads(str(raw)) if isinstance(raw, str) else raw
                except (json.JSONDecodeError, TypeError):
                    techs = []
                if not isinstance(techs, list):
                    continue
                if any(str(t).lower() == tech_name for t in techs):
                    pages.append({
                        "url": str(row.get("url") or ""),
                        "technology": tech_name,
                        "status": str(row.get("status") or ""),
                    })
    sliced = cap_list(pages, limit, max_cap=50)
    return {
        "technology_name": tech_name,
        "pages": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
    }
