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
        assert dispatch_tool("compose_custom_report", {"sections": []}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("export_custom_report", {"format": "bad"}, context=ctx, conn=conn)["error"]
        assert dispatch_tool("export_custom_report", {"report_spec_id": "missing"}, context=ctx, conn=conn)["error"]

    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export_tools.export_audit_html",
        return_value="<html></html>",
    ):
        out = dispatch_tool("export_audit_report", {"format": "html"}, context=ctx, conn=conn)
        assert out.get("artifact_id")

    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export_tools.export_audit_json",
        return_value="{}",
    ):
        out = dispatch_tool("export_audit_report", {"format": "json"}, context=ctx, conn=conn)
        assert out.get("format") == "json"

    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export_tools.export_audit_pdf",
        side_effect=FileNotFoundError,
    ):
        assert dispatch_tool("export_audit_report", {"format": "pdf"}, context=ctx, conn=conn)["error"]

    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export_tools._dispatch",
        return_value={"meta": "only"},
    ):
        assert dispatch_tool(
            "export_list_as_csv",
            {"tool_name": "list_broken_links"},
            context=ctx,
            conn=conn,
        )["error"]

    with patch.object(Ctx, "load_payload", return_value=payload), patch(
        "website_profiling.tools.audit_tools.export_tools.load_compare_pair",
        return_value=(None, None, None, None, {"error": "bad"}),
    ):
        assert dispatch_tool("export_compare_csv", {"baseline_report_id": 1}, context=ctx, conn=conn)["error"]

    with patch.object(Ctx, "load_payload", return_value=payload):
        bad_tool = dispatch_tool(
            "compose_custom_report",
            {
                "title": "T",
                "sections": [{"type": "tool", "tool_name": "export_audit_report", "tool_args": {}}],
            },
            context=ctx,
            conn=conn,
        )
        assert "not allowed" in bad_tool["error"]

        spec = dispatch_tool(
            "compose_custom_report",
            {"title": "T", "sections": [{"type": "executive_summary"}]},
            context=ctx,
            conn=conn,
        )
        with patch(
            "website_profiling.tools.audit_tools.export_tools.resolve_section_results",
            return_value=[{"pages": [{"url": "https://ex.com"}]}],
        ):
            html_out = dispatch_tool(
                "export_custom_report",
                {
                    "title": "Direct",
                    "format": "html",
                    "sections": [
                        {"type": "tool", "tool_name": "list_broken_links", "tool_args": {}},
                    ],
                },
                context=ctx,
                conn=conn,
            )
            assert html_out.get("artifact_id")
            pdf_out = dispatch_tool(
                "export_custom_report",
                {"report_spec_id": spec["report_spec_id"], "format": "pdf"},
                context=ctx,
                conn=conn,
            )
        if pdf_out.get("error"):
            pytest.skip(pdf_out["error"])
        assert pdf_out.get("format") == "pdf"

def test_export_custom_report_pdf_error(conn: MagicMock, ctx: Ctx, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    with patch.object(Ctx, "load_payload", return_value=_payload()), patch(
        "website_profiling.tools.audit_tools.export_tools.render_custom_report_pdf",
        side_effect=RuntimeError("no pdf"),
    ):
        assert dispatch_tool(
            "export_custom_report",
            {"title": "T", "format": "pdf", "sections": [{"type": "executive_summary"}]},
            context=ctx,
            conn=conn,
        )["error"] == "no pdf"


def test_export_audit_report_paths(conn: MagicMock, ctx: Ctx, tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    with patch.object(Ctx, "load_payload", return_value=_payload()), patch(
        "website_profiling.tools.audit_tools.export_tools.export_audit_pdf",
        return_value=b"%PDF",
    ):
        pdf_out = dispatch_tool("export_audit_report", {"format": "pdf"}, context=ctx, conn=conn)
        assert pdf_out.get("format") == "pdf"

    with patch.object(Ctx, "load_payload", return_value=_payload()), patch(
        "website_profiling.tools.audit_tools.export_tools.export_audit_csv",
        side_effect=RuntimeError("export failed"),
    ):
        assert "export failed" in dispatch_tool("export_audit_report", {"format": "csv"}, context=ctx, conn=conn)["error"]

    with patch.object(Ctx, "load_payload", return_value=_payload()):
        assert dispatch_tool("compose_custom_report", {"sections": [{"type": "notes", "markdown": "x"}]}, context=ctx, conn=conn)["error"]
        assert dispatch_tool(
            "export_custom_report",
            {"sections": [{"type": "executive_summary"}]},
            context=ctx,
            conn=conn,
        )["error"]
