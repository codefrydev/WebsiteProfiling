"""Router and workflow meta-tools (Tier 0)."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ._slice import parse_limit
from .context import AuditToolContext
from .tool_domains import classify_tool_domain


def search_audit_tools(_conn: Connection, _ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from .registry import search_tools

    query = str(args.get("query") or args.get("q") or "").strip()
    limit = parse_limit(args.get("limit"), 10, 50)
    if not query:
        return {"error": "query is required", "tools": [], "tool_names": []}
    matches = search_tools(query, limit=limit)
    return {
        "query": query,
        "tools": matches,
        "tool_names": [m["name"] for m in matches],
        "total": len(matches),
    }


def list_tool_domains(_conn: Connection, _ctx: AuditToolContext, _args: dict[str, Any]) -> dict[str, Any]:
    from .registry import list_domains_catalog, tools_catalog_by_domain

    catalog = list_domains_catalog()
    by_domain = tools_catalog_by_domain()
    return {
        "domains": catalog,
        "domain_tool_counts": {d: len(by_domain.get(d) or []) for d in by_domain},
    }


def _dispatch(name: str, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Dispatch one workflow step on its own pooled connection (safe to run in parallel)."""
    from .registry import dispatch_tool

    try:
        return dispatch_tool(name, args, context=ctx)
    except Exception as e:  # noqa: BLE001 - one failed step must not sink the whole workflow
        return {"error": str(e)}


def _run_steps(
    ctx: AuditToolContext,
    plan: list[tuple[str, dict[str, Any]]],
) -> list[dict[str, Any]]:
    """Dispatch workflow steps concurrently (bounded), preserving plan order.

    Each step opens its own pooled connection via ``_dispatch`` (psycopg connections
    are not safe to share across threads), so independent read-only steps run in
    parallel like Claude Code's parallel tool calls.
    """
    from ...concurrency import map_parallel, tool_concurrency

    return map_parallel(
        plan,
        lambda step: {"tool": step[0], "result": _dispatch(step[0], ctx, step[1])},
        max_workers=tool_concurrency(),
    )


def run_insight_workflow(_conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    wf_type = str(args.get("type") or "priorities").strip().lower()
    base = {"property_id": scoped.property_id, "report_id": scoped.report_id}

    if wf_type in ("traffic", "health"):
        plan = [("get_traffic_health_check", base)]
    elif wf_type in ("landing_pages", "landing"):
        limit = args.get("limit") or 30
        plan = [
            ("get_landing_page_blended_table", {**base, "limit": limit}),
            ("get_opportunity_matrix", {**base, "limit": limit}),
        ]
    else:
        plan = [
            ("get_opportunity_matrix", {**base, "limit": args.get("limit") or 30}),
            ("get_issue_to_traffic_map", {**base, "limit": args.get("limit") or 20}),
        ]

    return {"workflow": "insight", "type": wf_type, "steps": _run_steps(scoped, plan)}


def run_technical_workflow(_conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    base = {"property_id": scoped.property_id, "report_id": scoped.report_id}
    plan = [
        ("get_report_summary", base),
        ("get_critical_issues", base),
        ("get_issue_priority_breakdown", base),
    ]
    baseline = args.get("baseline_report_id")
    if baseline is not None:
        plan.append(("compare_issue_deltas", {**base, "baseline_report_id": baseline}))
    return {"workflow": "technical", "steps": _run_steps(scoped, plan)}


def run_keyword_workflow(_conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    base = {"property_id": scoped.property_id, "limit": args.get("limit") or 20}
    plan = [
        (name, base)
        for name in ("get_brand_keyword_split", "get_striking_distance_keywords", "list_keywords_ctr_opportunity")
    ]
    return {"workflow": "keyword", "steps": _run_steps(scoped, plan)}


def run_domain_agent(_conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Run a short scripted sequence of tools within one domain (subagent-style), in parallel."""
    from .registry import search_tools, tool_names_for_domain, tool_meta

    scoped = ctx.with_args(args)
    task = str(args.get("task") or "").strip()
    domain = str(args.get("domain") or "").strip().lower()
    max_steps = parse_limit(args.get("max_steps"), 5, 8)
    if not task:
        return {"error": "task is required"}

    meta = tool_meta()
    if domain:
        pool = set(tool_names_for_domain(domain))
    else:
        pool = set(meta.keys())

    matches = search_tools(task, limit=max_steps * 2)
    picked: list[str] = []
    for m in matches:
        name = m["name"]
        if name in pool and name not in picked:
            picked.append(name)
        if len(picked) >= max_steps:
            break

    if not picked:
        for m in matches:
            name = m["name"]
            if name not in picked and name in meta:
                picked.append(name)
            if len(picked) >= max_steps:
                break

    if not picked and domain:
        picked = tool_names_for_domain(domain)[:max_steps]

    base = {"property_id": scoped.property_id, "report_id": scoped.report_id, "limit": 20}
    steps = _run_steps(scoped, [(name, base) for name in picked])

    return {
        "task": task,
        "domain": domain or classify_tool_domain(picked[0]) if picked else "",
        "steps": steps,
        "tools_used": picked,
    }
