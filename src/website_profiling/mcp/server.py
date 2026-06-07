"""stdio MCP server exposing read-only Site Audit tools and resources."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from ..db.storage import db_session
from ..tools.audit_tools import AuditToolContext
from ..tools.audit_tools.registry import TOOL_DEFINITIONS, dispatch_tool, tool_handler_names

_URI_PROPERTY = re.compile(r"^audit://property/(\d+)$")
_URI_REPORT_LATEST = re.compile(r"^audit://property/(\d+)/report/latest$")
_URI_REPORT_ID = re.compile(r"^audit://property/(\d+)/report/(\d+)$")


def _default_property_id() -> int | None:
    raw = os.environ.get("WP_PROPERTY_ID", "").strip()
    if not raw:
        return None
    try:
        pid = int(raw)
        return pid if pid > 0 else None
    except ValueError:
        return None


def _merge_context(args: dict[str, Any]) -> AuditToolContext:
    pid = args.get("property_id")
    rid = args.get("report_id")
    default_pid = _default_property_id()
    try:
        property_id = int(pid) if pid is not None else default_pid
    except (TypeError, ValueError):
        property_id = default_pid
    try:
        report_id = int(rid) if rid is not None else None
    except (TypeError, ValueError):
        report_id = None
    return AuditToolContext(property_id=property_id, report_id=report_id)


def _payload_index(payload: dict[str, Any]) -> dict[str, Any]:
    """Truncated payload index: keys and list lengths only."""
    index: dict[str, Any] = {}
    for key, val in payload.items():
        if isinstance(val, list):
            index[key] = {"type": "list", "count": len(val)}
        elif isinstance(val, dict):
            index[key] = {"type": "object", "keys": list(val.keys())[:30]}
        else:
            index[key] = {"type": type(val).__name__, "preview": str(val)[:120]}
    return index


def _read_glossary_excerpt() -> str:
    root = Path(__file__).resolve().parents[3]
    path = root / "docs" / "GLOSSARY.md"
    if not path.is_file():
        return "Glossary file not found."
    text = path.read_text(encoding="utf-8")
    return text[:12000]


def _tools_catalog_json() -> str:
    domains: dict[str, list[str]] = {
        "portfolio": [],
        "issues": [],
        "crawl": [],
        "schema": [],
        "links": [],
        "indexation": [],
        "content": [],
        "keywords": [],
        "google": [],
        "backlinks": [],
        "performance": [],
        "drift": [],
        "security": [],
    }
    for tool in TOOL_DEFINITIONS:
        name = tool["name"]
        if name.startswith(("list_propert", "get_propert", "get_report", "get_executive", "get_site", "list_report")):
            domains["portfolio"].append(name)
        elif "issue" in name or "category" in name or "workflow" in name:
            domains["issues"].append(name)
        elif name in ("search_pages", "get_page_details", "get_internal_links", "list_redirects", "list_broken_links",
                      "get_status_code", "get_response_time", "get_depth", "get_crawl_segments", "get_browser"):
            domains["crawl"].append(name)
        elif "schema" in name or name == "get_seo_health":
            domains["schema"].append(name)
        elif "orphan" in name or "link" in name or "fingerprint" in name:
            domains["links"].append(name)
        elif "indexation" in name or "hreflang" in name or "language" in name:
            domains["indexation"].append(name)
        elif "content" in name or "social" in name or "ner" in name or "thin" in name or "opportunit" in name:
            domains["content"].append(name)
        elif "keyword" in name or "cannibal" in name or "misalignment" in name or "striking" in name or "semantic" in name:
            domains["keywords"].append(name)
        elif "google" in name or "gsc" in name or "ga4" in name:
            domains["google"].append(name)
        elif "backlink" in name or "competitor" in name or "bing" in name or "gsc_links" in name:
            domains["backlinks"].append(name)
        elif "lighthouse" in name or "crux" in name or "slow" in name:
            domains["performance"].append(name)
        elif "health" in name or "compare" in name or "alert" in name or "tech_stack" in name:
            domains["drift"].append(name)
        elif "security" in name:
            domains["security"].append(name)
        else:
            domains["portfolio"].append(name)
    return json.dumps({"tool_count": len(TOOL_DEFINITIONS), "handlers": sorted(tool_handler_names()), "domains": domains}, indent=2)


def _resolve_resource(uri: str) -> str:
    if uri == "audit://properties":
        result = dispatch_tool("list_properties", {})
        return json.dumps(result, indent=2, default=str)

    if uri == "audit://glossary":
        return _read_glossary_excerpt()

    if uri == "audit://tools":
        return _tools_catalog_json()

    m = _URI_PROPERTY.match(uri)
    if m:
        pid = int(m.group(1))
        prop = dispatch_tool("get_property", {"property_id": pid})
        summary = dispatch_tool("get_report_summary", {"property_id": pid})
        return json.dumps({"property": prop, "latest_report": summary}, indent=2, default=str)

    m = _URI_REPORT_LATEST.match(uri)
    if m:
        pid = int(m.group(1))
        ctx = AuditToolContext(property_id=pid)
        with db_session() as conn:
            payload = ctx.load_payload(conn)
        if not payload:
            return json.dumps({"error": "no report found"})
        return json.dumps(_payload_index(payload), indent=2, default=str)

    m = _URI_REPORT_ID.match(uri)
    if m:
        pid = int(m.group(1))
        rid = int(m.group(2))
        ctx = AuditToolContext(property_id=pid, report_id=rid)
        with db_session() as conn:
            payload = ctx.load_payload(conn)
        if not payload:
            return json.dumps({"error": "no report found"})
        return json.dumps(_payload_index(payload), indent=2, default=str)

    return json.dumps({"error": f"unknown resource: {uri}"})


def main() -> None:
    try:
        from mcp.server import Server
        from mcp.server.stdio import stdio_server
        from mcp.types import Resource, TextContent, Tool
    except ImportError as e:
        raise SystemExit(
            "MCP SDK not installed. Run: pip install -r requirements-mcp.txt",
        ) from e

    server = Server("site-audit")
    default_pid = _default_property_id()

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        out: list[Tool] = []
        for spec in TOOL_DEFINITIONS:
            out.append(
                Tool(
                    name=spec["name"],
                    description=spec.get("description", ""),
                    inputSchema=spec.get("inputSchema", {"type": "object", "properties": {}}),
                ),
            )
        return out

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any] | None) -> list[TextContent]:
        args = dict(arguments or {})
        ctx = _merge_context(args)
        result = dispatch_tool(name, args, context=ctx)
        text = json.dumps(result, indent=2, default=str)
        return [TextContent(type="text", text=text)]

    @server.list_resources()
    async def list_resources() -> list[Resource]:
        resources = [
            Resource(uri="audit://properties", name="Properties", description="All configured site properties", mimeType="application/json"),
            Resource(uri="audit://glossary", name="Glossary", description="Site Audit field glossary excerpt", mimeType="text/markdown"),
            Resource(uri="audit://tools", name="Tool catalog", description="MCP tool catalog grouped by domain", mimeType="application/json"),
        ]
        if default_pid:
            resources.extend([
                Resource(
                    uri=f"audit://property/{default_pid}",
                    name=f"Property {default_pid}",
                    description="Property details and latest report summary",
                    mimeType="application/json",
                ),
                Resource(
                    uri=f"audit://property/{default_pid}/report/latest",
                    name=f"Latest report index (property {default_pid})",
                    description="Payload key index for latest audit report",
                    mimeType="application/json",
                ),
            ])
        return resources

    @server.read_resource()
    async def read_resource(uri: str) -> str:
        return _resolve_resource(uri)

    async def run() -> None:
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())

    import asyncio

    asyncio.run(run())


if __name__ == "__main__":
    main()
