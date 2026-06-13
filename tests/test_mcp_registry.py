"""MCP tool registry validation (no live MCP process)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.tools.audit_tools.registry import (
    TOOL_DEFINITIONS,
    dispatch_tool,
    search_tools,
    validate_tool_registry,
)
from website_profiling.tools.audit_tools.tool_domains import TIER_0_TOOLS


def test_tool_definitions_schema() -> None:
    assert len(TOOL_DEFINITIONS) == 340
    for tool in TOOL_DEFINITIONS:
        assert tool.get("name")
        assert tool.get("description")
        schema = tool.get("inputSchema")
        assert isinstance(schema, dict)
        assert schema.get("type") == "object"


def test_validate_tool_registry() -> None:
    assert validate_tool_registry() == []


def test_tier0_tools_have_handlers() -> None:
    from website_profiling.tools.audit_tools.registry import tool_handler_names

    assert TIER_0_TOOLS <= tool_handler_names()


def test_search_tools_finds_broken_links() -> None:
    matches = search_tools("broken links", limit=5)
    names = {m["name"] for m in matches}
    assert "list_broken_links" in names or "list_broken_link_sources" in names


def test_dispatch_list_properties_roundtrip() -> None:
    conn = MagicMock()
    props = [{"id": 1, "name": "ex.com", "canonical_domain": "ex.com"}]
    with patch(
        "website_profiling.tools.audit_tools.properties.list_properties_public",
        return_value=props,
    ):
        result = dispatch_tool("list_properties", {}, conn=conn)
    assert result["count"] == 1
