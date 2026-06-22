"""Line-coverage tests for audit_tools.export_tools dispatch paths."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.tools.audit_tools import dispatch_tool
from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx


@pytest.fixture
def ctx() -> Ctx:
    return Ctx(property_id=1, report_id=1)


@pytest.fixture
def conn() -> MagicMock:
    return MagicMock()


def _payload() -> dict:
    return {
        "site_name": "Example",
        "report_generated_at": "2026-06-07T12:00:00Z",
        "categories": [{"id": "tech", "name": "Tech", "score": 80, "issues": []}],
        "executive_summary": {"headline": "OK"},
    }


def test_export_tools_formats(conn: MagicMock, ctx: Ctx, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    payload = _payload()
    with patch.object(Ctx, "load_payload", return_value=payload):
        assert dispatch_tool("export_audit_report", {"format": "bad"}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("export_list_as_csv", {}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("export_list_as_csv", {"tool_name": "nope"}, context=ctx, conn=conn)["error"]

    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export.export_tools.export_audit_json",
        return_value="{}",
    ):
        out = dispatch_tool("export_audit_report", {"format": "json"}, context=ctx, conn=conn)
        assert out.get("format") == "json"

    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export.export_tools.fetch_report_pdf",
        side_effect=FileNotFoundError,
    ):
        assert dispatch_tool("export_audit_report", {"format": "pdf"}, context=ctx, conn=conn)["error"]

    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export.export_tools._dispatch",
        return_value={"meta": "only"},
    ):
        assert dispatch_tool(
            "export_list_as_csv",
            {"tool_name": "list_broken_links"},
            context=ctx,
            conn=conn,
        )["error"]

    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export.export_tools.load_compare_pair",
        return_value=(None, None, None, None, {"error": "bad"}),
    ):
        assert dispatch_tool("export_compare_csv", {"baseline_report_id": 1}, context=ctx, conn=conn)["error"]


def test_export_audit_report_paths(conn: MagicMock, ctx: Ctx, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    with patch.object(Ctx, "load_payload", return_value=_payload()), patch(
        "website_profiling.tools.audit_tools.export.export_tools.fetch_report_pdf",
        return_value=b"%PDF-1.4",
    ):
        pdf_out = dispatch_tool("export_audit_report", {"format": "pdf"}, context=ctx, conn=conn)
        assert pdf_out.get("format") == "pdf"

    with patch.object(Ctx, "load_payload", return_value=_payload()), patch(
        "website_profiling.tools.audit_tools.export.export_tools.export_audit_csv",
        side_effect=RuntimeError("export failed"),
    ):
        assert "export failed" in dispatch_tool("export_audit_report", {"format": "csv"}, context=ctx, conn=conn)["error"]
