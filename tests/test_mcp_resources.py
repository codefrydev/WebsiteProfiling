"""MCP resource URI resolution tests."""
from __future__ import annotations

from unittest.mock import patch

from website_profiling.mcp import server as mcp_server


def test_resolve_properties_resource() -> None:
    with patch("website_profiling.mcp.server.dispatch_tool", return_value={"count": 0, "properties": []}):
        text = mcp_server._resolve_resource("audit://properties")
    assert "properties" in text


def test_resolve_report_latest_missing_payload() -> None:
    with patch("website_profiling.mcp.server.db_session") as mock_db, patch.object(
        mcp_server.AuditToolContext, "load_payload", return_value=None,
    ):
        mock_db.return_value.__enter__.return_value = object()
        text = mcp_server._resolve_resource("audit://property/1/report/latest")
    assert "error" in text


def test_resolve_glossary_and_tools() -> None:
    text = mcp_server._resolve_resource("audit://tools")
    assert "tool_count" in text
    unknown = mcp_server._resolve_resource("audit://unknown")
    assert "error" in unknown


def test_resolve_property_and_report() -> None:
    with patch("website_profiling.mcp.server.dispatch_tool", side_effect=[
        {"property": {"id": 1}},
        {"health_score": 80},
    ]):
        text = mcp_server._resolve_resource("audit://property/1")
    assert "property" in text

    with patch("website_profiling.mcp.server.db_session") as mock_db, patch.object(
        mcp_server.AuditToolContext, "load_payload", return_value={"summary": {}, "categories": []},
    ):
        mock_db.return_value.__enter__.return_value = object()
        text = mcp_server._resolve_resource("audit://property/1/report/latest")
    assert "summary" in text or "type" in text
