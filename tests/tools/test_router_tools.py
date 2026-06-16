"""Tests for run_domain_agent fallback behavior and parallel step dispatch."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.tools.audit_tools import AuditToolContext
from website_profiling.tools.audit_tools import router_tools as router_mod
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
    ), patch(
        "website_profiling.tools.audit_tools.registry.tool_names_for_domain",
        return_value=["get_unrelated_tool"],
    ), patch.object(router_mod, "_dispatch", return_value={"ok": True}):
        result = run_domain_agent(conn, ctx, {
            "task": "broken links audit",
            "domain": "schema",
            "max_steps": 2,
        })

    assert result["tools_used"] == ["list_broken_links", "get_schema_coverage"]
    # steps are returned in plan order even though they run concurrently
    assert [s["tool"] for s in result["steps"]] == ["list_broken_links", "get_schema_coverage"]


def test_dispatch_runs_each_step_on_its_own_connection() -> None:
    ctx = AuditToolContext(property_id=1)
    with patch(
        "website_profiling.tools.audit_tools.registry.dispatch_tool",
        return_value={"ok": 1},
    ) as dispatched:
        out = router_mod._dispatch("get_report_summary", ctx, {"limit": 5})

    assert out == {"ok": 1}
    # No explicit conn is threaded through → each step checks out its own pooled session.
    _, kwargs = dispatched.call_args
    assert "conn" not in kwargs
    assert kwargs.get("context") is ctx


def test_dispatch_isolates_step_errors() -> None:
    ctx = AuditToolContext(property_id=1)
    with patch(
        "website_profiling.tools.audit_tools.registry.dispatch_tool",
        side_effect=RuntimeError("boom"),
    ):
        out = router_mod._dispatch("get_report_summary", ctx, {})

    assert out == {"error": "boom"}
