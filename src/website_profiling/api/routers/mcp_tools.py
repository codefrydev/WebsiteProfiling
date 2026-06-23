"""MCP audit tool catalog — /api/mcp-tools."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["mcp-tools"])


@router.get("/mcp-tools")
def mcp_tools() -> dict[str, Any]:
    try:
        from website_profiling.tools.audit_tools.registry import (
            TOOL_DEFINITIONS,
            get_tool_meta,
            mcp_tool_names,
        )
        from website_profiling.tools.audit_tools.tool_domains import (
            MCP_DOMAIN_BUNDLES,
            classify_tool_domain,
        )

        bundle_sets = {b: mcp_tool_names(b) for b in MCP_DOMAIN_BUNDLES.keys()}
        tools = []
        for spec in TOOL_DEFINITIONS:
            name = spec.get("name", "")
            if not name:
                continue
            meta = get_tool_meta(name) or {}
            domain = meta.get("domain") or classify_tool_domain(name)
            in_bundles = [b for b, names in bundle_sets.items() if name in names]
            tools.append({
                "name": name,
                "description": spec.get("description", ""),
                "domain": domain,
                "bundles": in_bundles,
            })
        return {"tools": tools, "bundles": list(MCP_DOMAIN_BUNDLES.keys())}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
