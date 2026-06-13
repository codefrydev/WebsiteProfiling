"""stdio MCP server exposing read-only Site Audit tools and resources."""
from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from ..db.storage import db_session
from ..tools.audit_tools import AuditToolContext
from ..tools.audit_tools.registry import (
    TOOL_DEFINITIONS,
    dispatch_tool,
    list_domains_catalog,
    mcp_tool_names,
    tools_catalog_by_domain,
)
from ..tools.audit_tools.tool_domains import MCP_DOMAIN_BUNDLES

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


def _mcp_domain() -> str:
    return (os.environ.get("WP_MCP_DOMAIN") or "core").strip().lower()


def _exposed_tool_names() -> set[str]:
    return mcp_tool_names(_mcp_domain())


def _tools_catalog_json() -> str:
    domain = _mcp_domain()
    exposed = _exposed_tool_names()
    by_domain = tools_catalog_by_domain()
    scoped: dict[str, list[str]] = {}
    for d, names in by_domain.items():
        filtered = [n for n in names if n in exposed]
        if filtered:
            scoped[d] = filtered
    return json.dumps({
        "mcp_domain": domain,
        "tool_count": len(exposed),
        "handlers": sorted(exposed),
        "domains": scoped,
        "available_mcp_domains": sorted(MCP_DOMAIN_BUNDLES.keys()),
    }, indent=2)


def _domains_resource_json() -> str:
    return json.dumps({
        "current_mcp_domain": _mcp_domain(),
        "bundles": {
            key: sorted(domains)
            for key, domains in MCP_DOMAIN_BUNDLES.items()
        },
        "catalog": list_domains_catalog(),
    }, indent=2)


def _resolve_resource(uri: str) -> str:
    if uri == "audit://properties":
        result = dispatch_tool("list_properties", {})
        return json.dumps(result, indent=2, default=str)

    if uri == "audit://glossary":
        return _read_glossary_excerpt()

    if uri == "audit://tools":
        return _tools_catalog_json()

    if uri == "audit://domains":
        return _domains_resource_json()

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
            "MCP SDK not installed. Run: pip install -r requirements.txt",
        ) from e

    server = Server(f"site-audit-{_mcp_domain()}")
    default_pid = _default_property_id()
    exposed = _exposed_tool_names()

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        out: list[Tool] = []
        for spec in TOOL_DEFINITIONS:
            if spec["name"] not in exposed:
                continue
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
        if name not in exposed:
            result = {
                "error": f"tool not exposed in MCP domain {_mcp_domain()}: {name}",
                "hint": "Connect WP_MCP_DOMAIN=full or the domain server that includes this tool.",
            }
            return [TextContent(type="text", text=json.dumps(result, indent=2, default=str))]
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
            Resource(uri="audit://tools", name="Tool catalog", description="MCP tool catalog for the connected domain server", mimeType="application/json"),
            Resource(uri="audit://domains", name="MCP domain servers", description="Available WP_MCP_DOMAIN bundles and domain groupings", mimeType="application/json"),
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
