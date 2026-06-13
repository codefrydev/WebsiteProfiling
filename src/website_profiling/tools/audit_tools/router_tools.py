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


def _dispatch(name: str, conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    from .registry import dispatch_tool

    return dispatch_tool(name, args, context=ctx, conn=conn)


def run_insight_workflow(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    wf_type = str(args.get("type") or "priorities").strip().lower()
    base = {"property_id": scoped.property_id, "report_id": scoped.report_id}
    steps: list[dict[str, Any]] = []

    if wf_type in ("traffic", "health"):
        r = _dispatch("get_traffic_health_check", conn, scoped, base)
        steps.append({"tool": "get_traffic_health_check", "result": r})
    elif wf_type in ("landing_pages", "landing"):
        r = _dispatch("get_landing_page_blended_table", conn, scoped, {**base, "limit": args.get("limit") or 30})
        steps.append({"tool": "get_landing_page_blended_table", "result": r})
        r2 = _dispatch("get_opportunity_matrix", conn, scoped, {**base, "limit": args.get("limit") or 30})
        steps.append({"tool": "get_opportunity_matrix", "result": r2})
    else:
        r = _dispatch("get_opportunity_matrix", conn, scoped, {**base, "limit": args.get("limit") or 30})
        steps.append({"tool": "get_opportunity_matrix", "result": r})
        r2 = _dispatch("get_issue_to_traffic_map", conn, scoped, {**base, "limit": args.get("limit") or 20})
        steps.append({"tool": "get_issue_to_traffic_map", "result": r2})

    return {"workflow": "insight", "type": wf_type, "steps": steps}


def run_technical_workflow(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    base = {"property_id": scoped.property_id, "report_id": scoped.report_id}
    steps = [
        {"tool": "get_report_summary", "result": _dispatch("get_report_summary", conn, scoped, base)},
        {"tool": "get_critical_issues", "result": _dispatch("get_critical_issues", conn, scoped, base)},
        {"tool": "get_issue_priority_breakdown", "result": _dispatch("get_issue_priority_breakdown", conn, scoped, base)},
    ]
    baseline = args.get("baseline_report_id")
    if baseline is not None:
        steps.append({
            "tool": "compare_issue_deltas",
            "result": _dispatch("compare_issue_deltas", conn, scoped, {
                **base,
                "baseline_report_id": baseline,
            }),
        })
    return {"workflow": "technical", "steps": steps}


def run_keyword_workflow(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required"}
    base = {"property_id": scoped.property_id, "limit": args.get("limit") or 20}
    steps = []
    for tool_name in ("get_brand_keyword_split", "get_striking_distance_keywords", "list_keywords_ctr_opportunity"):
        steps.append({"tool": tool_name, "result": _dispatch(tool_name, conn, scoped, base)})
    return {"workflow": "keyword", "steps": steps}


def run_domain_agent(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Run a short scripted sequence of tools within one domain (subagent-style)."""
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
    steps = []
    for name in picked:
        steps.append({"tool": name, "result": _dispatch(name, conn, scoped, base)})

    return {
        "task": task,
        "domain": domain or classify_tool_domain(picked[0]) if picked else "",
        "steps": steps,
        "tools_used": picked,
    }
