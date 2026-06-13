"""Tests for run_domain_agent fallback behavior."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.tools.audit_tools import AuditToolContext
from website_profiling.tools.audit_tools.router_tools import run_domain_agent


def test_run_domain_agent_falls_back_to_global_search() -> None:
    conn = MagicMock()
    ctx = AuditToolContext(property_id=1)
    fake_matches = [
        {"name": "list_broken_links", "description": "", "domain": "links", "tier": 1},
        {"name": "get_schema_coverage", "description": "", "domain": "schema", "tier": 1},
    ]
    with patch(
        "website_profiling.tools.audit_tools.registry.search_tools",
        return_value=fake_matches,
    ):
        with patch(
            "website_profiling.tools.audit_tools.registry.tool_names_for_domain",
            return_value=["get_unrelated_tool"],
        ):
            result = run_domain_agent(conn, ctx, {
                "task": "broken links audit",
                "domain": "schema",
                "max_steps": 2,
            })

    assert result["tools_used"] == ["list_broken_links", "get_schema_coverage"]
