"""MCP server helper and main() coverage."""
from __future__ import annotations

import asyncio
import json
import os
import runpy
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from website_profiling.mcp import server as mcp_server


def test_default_property_id_env() -> None:
    with patch.dict(os.environ, {"WP_PROPERTY_ID": "12"}):
        assert mcp_server._default_property_id() == 12
    with patch.dict(os.environ, {"WP_PROPERTY_ID": "0"}):
        assert mcp_server._default_property_id() is None
    with patch.dict(os.environ, {"WP_PROPERTY_ID": "bad"}):
        assert mcp_server._default_property_id() is None
    with patch.dict(os.environ, {}, clear=True):
        assert mcp_server._default_property_id() is None


def test_merge_context() -> None:
    with patch.dict(os.environ, {"WP_PROPERTY_ID": "3"}):
        ctx = mcp_server._merge_context({"property_id": 9, "report_id": 4})
    assert ctx.property_id == 9
    assert ctx.report_id == 4

    with patch.dict(os.environ, {"WP_PROPERTY_ID": "3"}):
        ctx = mcp_server._merge_context({"property_id": "bad", "report_id": "bad"})
    assert ctx.property_id == 3
    assert ctx.report_id is None


def test_payload_index_variants() -> None:
    index = mcp_server._payload_index({
        "items": [1, 2],
        "meta": {"a": 1},
        "score": 88,
    })
    assert index["items"]["count"] == 2
    assert index["meta"]["type"] == "object"
    assert index["score"]["type"] == "int"


def test_read_glossary_excerpt() -> None:
    text = mcp_server._read_glossary_excerpt()
    assert isinstance(text, str)
    assert text


def test_read_glossary_excerpt_missing(monkeypatch) -> None:
    monkeypatch.setattr(Path, "is_file", lambda _self: False)
    assert mcp_server._read_glossary_excerpt() == "Glossary file not found."


def test_tools_catalog_json_includes_security_tools() -> None:
    catalog = json.loads(mcp_server._tools_catalog_json())
    assert catalog["tool_count"] >= 123
    assert "get_security_findings" in catalog["domains"]["security"]


def test_tools_catalog_json_backlinks_domain() -> None:
    fake_tools = [
        {
            "name": "get_bing_overview",
            "description": "Bing overview without link in name.",
            "inputSchema": {"type": "object", "properties": {}},
        },
    ]
    with patch("website_profiling.mcp.server.TOOL_DEFINITIONS", fake_tools):
        catalog = json.loads(mcp_server._tools_catalog_json())
    assert catalog["domains"]["backlinks"] == ["get_bing_overview"]


def test_resolve_glossary_and_report_by_id() -> None:
    glossary = mcp_server._resolve_resource("audit://glossary")
    assert isinstance(glossary, str)

    with patch("website_profiling.mcp.server.db_session") as mock_db, patch.object(
        mcp_server.AuditToolContext, "load_payload", return_value=None,
    ):
        mock_db.return_value.__enter__.return_value = object()
        missing = mcp_server._resolve_resource("audit://property/1/report/99")
    assert "error" in missing

    with patch("website_profiling.mcp.server.db_session") as mock_db, patch.object(
        mcp_server.AuditToolContext, "load_payload", return_value={"summary": {"score": 1}, "pages": [1, 2]},
    ):
        mock_db.return_value.__enter__.return_value = object()
        found = mcp_server._resolve_resource("audit://property/1/report/99")
    payload = json.loads(found)
    assert payload["summary"]["type"] == "object"


def test_mcp_main_missing_sdk() -> None:
    with patch.dict(sys.modules, {"mcp.server": None, "mcp.server.stdio": None, "mcp.types": None}):
        with pytest.raises(SystemExit, match="MCP SDK"):
            mcp_server.main()


def test_mcp_main_registers_handlers(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeServer:
        def __init__(self, name: str) -> None:
            captured["name"] = name

        def list_tools(self):
            def decorator(fn):
                captured["list_tools"] = fn
                return fn
            return decorator

        def call_tool(self):
            def decorator(fn):
                captured["call_tool"] = fn
                return fn
            return decorator

        def list_resources(self):
            def decorator(fn):
                captured["list_resources"] = fn
                return fn
            return decorator

        def read_resource(self):
            def decorator(fn):
                captured["read_resource"] = fn
                return fn
            return decorator

        def create_initialization_options(self):
            return {}

        async def run(self, *_args, **_kwargs) -> None:
            captured["ran"] = True

    class FakeStdioCM:
        async def __aenter__(self):
            return (MagicMock(), MagicMock())

        async def __aexit__(self, *_args):
            return False

    fake_server_mod = MagicMock()
    fake_server_mod.Server = FakeServer
    fake_stdio_mod = MagicMock()
    fake_stdio_mod.stdio_server = MagicMock(return_value=FakeStdioCM())
    fake_types_mod = MagicMock()
    fake_types_mod.Tool = lambda **kwargs: kwargs
    fake_types_mod.TextContent = lambda **kwargs: kwargs
    fake_types_mod.Resource = lambda **kwargs: kwargs

    monkeypatch.setitem(sys.modules, "mcp", MagicMock())
    monkeypatch.setitem(sys.modules, "mcp.server", fake_server_mod)
    monkeypatch.setitem(sys.modules, "mcp.server.stdio", fake_stdio_mod)
    monkeypatch.setitem(sys.modules, "mcp.types", fake_types_mod)

    with patch.dict(os.environ, {"WP_PROPERTY_ID": "7"}, clear=False):
        mcp_server.main()

    assert captured["name"] == "site-audit"
    assert captured["ran"] is True
    tools = asyncio.run(captured["list_tools"]())  # type: ignore[arg-type]
    assert len(tools) >= 123
    resources = asyncio.run(captured["list_resources"]())  # type: ignore[arg-type]
    assert any(r["uri"] == "audit://property/7" for r in resources)

    with patch("website_profiling.mcp.server.dispatch_tool", return_value={"ok": True}):
        content = asyncio.run(captured["call_tool"]("list_properties", {"property_id": 1}))  # type: ignore[arg-type]
    assert content[0]["text"] == json.dumps({"ok": True}, indent=2, default=str)
    read_text = asyncio.run(captured["read_resource"]("audit://tools"))  # type: ignore[arg-type]
    assert read_text.startswith("{")


def test_mcp_package_main(monkeypatch) -> None:
    with patch("website_profiling.mcp.server.main") as mock_main:
        runpy.run_module("website_profiling.mcp", run_name="__main__")
    mock_main.assert_called_once()


def test_mcp_server_main_guard() -> None:
    with pytest.raises(SystemExit, match="MCP SDK"):
        runpy.run_module("website_profiling.mcp.server", run_name="__main__")
