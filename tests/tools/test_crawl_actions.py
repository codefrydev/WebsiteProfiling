"""Tests for chat crawl action tools."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

from website_profiling.tools.audit_tools.context import AuditToolContext
from website_profiling.tools.audit_tools.crawl.crawl_actions import (
    CHAT_CRAWL_TOOL,
    prepare_audit_run,
)


class _FakeCursor:
    def __init__(self, row):
        self._row = row

    def fetchone(self):
        return self._row


class _FakeConn:
    def __init__(self, *, job_running: bool = False):
        self._job_running = job_running

    def execute(self, sql, params=None):
        if "pipeline_jobs" in sql:
            return _FakeCursor((1,) if self._job_running else None)
        return _FakeCursor(None)


def test_prepare_audit_run_disabled_when_setting_off() -> None:
    conn = _FakeConn()
    ctx = AuditToolContext(property_id=1)
    with patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl",
        return_value=False,
    ):
        out = prepare_audit_run(conn, ctx, {"start_url": "https://example.com"})
    assert "error" in out
    assert "disabled" in out["error"].lower()


def test_prepare_audit_run_ready_default() -> None:
    conn = _FakeConn()
    ctx = AuditToolContext(property_id=1)
    saved = {"site_name": "Test", "run_crawl": "false"}
    with patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl",
        return_value=True,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=(saved, []),
    ):
        out = prepare_audit_run(
            conn,
            ctx,
            {
                "mode": "default",
                "start_url": "https://example.com",
                "crawl_preset_id": "starter",
                "pipeline_mode": "full-audit",
            },
        )
    assert out.get("ready") is True
    assert out["summary"]["start_url"] == "https://example.com"
    assert out["summary"]["crawl_preset"] == "starter"
    assert out["run_spec"]["command"] == ""
    assert out["run_spec"]["state"]["start_url"] == "https://example.com"
    assert out["run_spec"]["state"]["run_crawl"] == "true"


def test_prepare_audit_run_custom_overrides() -> None:
    conn = _FakeConn()
    ctx = AuditToolContext(property_id=2)
    with patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl",
        return_value=True,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({}, []),
    ):
        out = prepare_audit_run(
            conn,
            ctx,
            {
                "mode": "custom",
                "start_url": "https://spa.example.com",
                "crawl_preset_id": "spa",
                "pipeline_mode": "crawl-only",
                "config_overrides": {
                    "max_pages": "100",
                    "crawl_render_mode": "javascript",
                },
            },
        )
    assert out.get("ready") is True
    assert out["run_spec"]["command"] == "crawl"
    state = out["run_spec"]["state"]
    assert state["max_pages"] == "100"
    assert state["crawl_render_mode"] == "javascript"


def test_prepare_audit_run_new_property_payload() -> None:
    conn = _FakeConn()
    ctx = AuditToolContext(property_id=None)
    with patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl",
        return_value=True,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({}, []),
    ):
        out = prepare_audit_run(
            conn,
            ctx,
            {
                "mode": "default",
                "create_property": {
                    "name": "Example",
                    "site_url": "https://example.com",
                },
            },
        )
    assert out.get("ready") is True
    cp = out["run_spec"]["create_property"]
    assert cp is not None
    assert cp["canonical_domain"] == "example.com"
    assert cp["site_url"] == "https://example.com"


def test_prepare_audit_run_job_running() -> None:
    conn = _FakeConn(job_running=True)
    ctx = AuditToolContext(property_id=1)
    with patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl",
        return_value=True,
    ):
        out = prepare_audit_run(conn, ctx, {"start_url": "https://example.com"})
    assert out.get("ready") is False
    assert out.get("job_running") is True


def test_prepare_audit_run_uses_property_default_preset() -> None:
    conn = _FakeConn()
    ctx = AuditToolContext(property_id=3)
    prop = {
        "id": 3,
        "site_url": "https://example.com",
        "default_crawl_preset": "spa",
    }
    with patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions._chat_allow_crawl",
        return_value=True,
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.read_pipeline_config",
        return_value=({}, []),
    ), patch(
        "website_profiling.tools.audit_tools.crawl.crawl_actions.get_property_by_id",
        return_value=prop,
    ):
        out = prepare_audit_run(
            conn,
            ctx,
            {"mode": "default", "start_url": "https://example.com"},
        )
    assert out.get("ready") is True
    assert out["summary"]["crawl_preset"] == "spa"
    assert out["run_spec"]["state"]["crawl_render_mode"] == "auto"


def test_chat_crawl_tool_constant() -> None:
    assert CHAT_CRAWL_TOOL == "prepare_audit_run"
