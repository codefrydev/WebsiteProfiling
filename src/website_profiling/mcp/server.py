"""stdio MCP server exposing read-only Site Audit tools."""
from __future__ import annotations

import json
import os
from typing import Any

from ..tools.audit_tools import AuditToolContext
from ..tools.audit_tools.registry import TOOL_DEFINITIONS, dispatch_tool


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


def main() -> None:
    try:
        from mcp.server import Server
        from mcp.server.stdio import stdio_server
        from mcp.types import TextContent, Tool
    except ImportError as e:
        raise SystemExit(
            "MCP SDK not installed. Run: pip install -r requirements-mcp.txt",
        ) from e

    server = Server("site-audit")

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

    async def run() -> None:
        async with stdio_server() as (read_stream, write_stream):
            await server.run(read_stream, write_stream, server.create_initialization_options())

    import asyncio

    asyncio.run(run())


if __name__ == "__main__":
    main()
