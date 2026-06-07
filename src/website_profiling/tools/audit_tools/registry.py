"""Tool registry and dispatch for MCP and chat agent."""
from __future__ import annotations

from typing import Any, Callable

from psycopg import Connection

from ...db.storage import db_session
from .context import AuditToolContext
from .crawl import get_internal_links, get_page_details, search_pages
from .google import get_google_summary
from .health import get_health_history
from .keywords import get_keyword_summary, search_keywords
from .lighthouse import get_lighthouse_for_url, get_lighthouse_summary
from .properties import get_property, list_properties
from .report import get_category_scores, get_report_summary, list_issues

ToolHandler = Callable[[Connection, AuditToolContext, dict[str, Any]], dict[str, Any]]

_TOOL_HANDLERS: dict[str, ToolHandler] = {
    "list_properties": list_properties,
    "get_property": get_property,
    "get_report_summary": get_report_summary,
    "list_issues": list_issues,
    "get_category_scores": get_category_scores,
    "search_pages": search_pages,
    "get_page_details": get_page_details,
    "get_internal_links": get_internal_links,
    "get_lighthouse_summary": get_lighthouse_summary,
    "get_lighthouse_for_url": get_lighthouse_for_url,
    "get_keyword_summary": get_keyword_summary,
    "search_keywords": search_keywords,
    "get_google_summary": get_google_summary,
    "get_health_history": get_health_history,
}

# v1 public tool list (10 primary + helpers used by agent)
TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "list_properties",
        "description": "List all configured site properties (domains) in Site Audit.",
        "inputSchema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "get_property",
        "description": "Get details for one property by property_id.",
        "inputSchema": {
            "type": "object",
            "properties": {"property_id": {"type": "integer", "description": "Property ID"}},
            "required": ["property_id"],
        },
    },
    {
        "name": "get_report_summary",
        "description": "Health score, issue counts by priority, crawl stats, and category scores for the latest or specified report.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "integer"},
                "report_id": {"type": "integer"},
            },
            "required": [],
        },
    },
    {
        "name": "list_issues",
        "description": "List audit issues with optional filters. Returns paginated results (max 50).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "integer"},
                "report_id": {"type": "integer"},
                "priority": {"type": "string", "enum": ["Critical", "High", "Medium", "Low"]},
                "category_id": {"type": "string", "description": "e.g. technical_seo, link_health"},
                "url_contains": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            },
            "required": [],
        },
    },
    {
        "name": "search_pages",
        "description": "Search crawled pages by status code or URL substring. Max 30 results.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "integer"},
                "report_id": {"type": "integer"},
                "status": {"type": "string", "description": "HTTP status e.g. 404"},
                "url_contains": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 30},
            },
            "required": [],
        },
    },
    {
        "name": "get_page_details",
        "description": "Crawl row, Lighthouse snippet, and GSC/GA4 slice for one URL.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "url": {"type": "string"},
                "property_id": {"type": "integer"},
                "report_id": {"type": "integer"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "get_lighthouse_summary",
        "description": "Site-wide Lighthouse summary and pages with poor performance scores.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "integer"},
                "report_id": {"type": "integer"},
            },
            "required": [],
        },
    },
    {
        "name": "get_keyword_summary",
        "description": "Top keywords, striking-distance count, and GSC metrics for a property.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "integer"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
            },
            "required": ["property_id"],
        },
    },
    {
        "name": "get_google_summary",
        "description": "GSC and GA4 headline metrics, top queries and pages for a property.",
        "inputSchema": {
            "type": "object",
            "properties": {"property_id": {"type": "integer"}},
            "required": [],
        },
    },
    {
        "name": "get_health_history",
        "description": "Historical health score snapshots for a property (for trend analysis).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "property_id": {"type": "integer"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 30},
            },
            "required": ["property_id"],
        },
    },
]


def dispatch_tool(
    name: str,
    args: dict[str, Any] | None,
    *,
    context: AuditToolContext | None = None,
    conn: Connection | None = None,
) -> dict[str, Any]:
    """Run a tool by name. Uses db_session when conn is not provided."""
    handler = _TOOL_HANDLERS.get(name)
    if handler is None:
        return {"error": f"unknown tool: {name}"}

    ctx = context or AuditToolContext()
    payload_args = dict(args or {})
    merged_ctx = ctx.with_args(payload_args)

    if conn is not None:
        return handler(conn, merged_ctx, payload_args)

    with db_session() as session:
        return handler(session, merged_ctx, payload_args)


def openai_tools_schema() -> list[dict[str, Any]]:
    """Convert TOOL_DEFINITIONS to OpenAI function-calling format."""
    out: list[dict[str, Any]] = []
    for tool in TOOL_DEFINITIONS:
        out.append({
            "type": "function",
            "function": {
                "name": tool["name"],
                "description": tool.get("description", ""),
                "parameters": tool.get("inputSchema", {"type": "object", "properties": {}}),
            },
        })
    return out
