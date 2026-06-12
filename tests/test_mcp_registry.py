"""MCP tool registry validation (no live MCP process)."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.tools.audit_tools.registry import TOOL_DEFINITIONS, dispatch_tool


def test_tool_definitions_schema() -> None:
    assert len(TOOL_DEFINITIONS) == 221
    for tool in TOOL_DEFINITIONS:
        assert tool.get("name")
        assert tool.get("description")
        schema = tool.get("inputSchema")
        assert isinstance(schema, dict)
        assert schema.get("type") == "object"


def test_dispatch_list_properties_roundtrip() -> None:
    conn = MagicMock()
    props = [{"id": 1, "name": "ex.com", "canonical_domain": "ex.com"}]
    with patch(
        "website_profiling.tools.audit_tools.properties.list_properties_public",
        return_value=props,
    ):
        result = dispatch_tool("list_properties", {}, conn=conn)
    assert result["count"] == 1
