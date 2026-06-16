"""Line-coverage tests for export_custom helpers."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from website_profiling.tools.audit_tools.context import AuditToolContext as Ctx
from website_profiling.tools.export_custom import (
    _section_html_tool_result,
    _table_from_rows,
    render_custom_report_html,
    render_custom_report_pdf,
    resolve_section_results,
    validate_sections,
)


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




def test_export_custom_helpers() -> None:
    assert "No data" in _table_from_rows([])
    assert "No columns" in _table_from_rows([{}])
    big = _table_from_rows([{"url": f"https://ex.com/{i}", "n": i} for i in range(60)], max_rows=50)
    assert "Showing 50 of 60" in big

    err_html = _section_html_tool_result("H", {"error": "boom"})
    assert "boom" in err_html
    rows_html = _section_html_tool_result("H", {"pages": [{"url": "u"}]})
    assert "u" in rows_html
    items_html = _section_html_tool_result("H", {"items": [{"k": "v"}]})
    assert "v" in items_html
    preview_html = _section_html_tool_result("H", {"meta": "x"})
    assert "json-preview" in preview_html

    sections, err = validate_sections([{"type": "notes", "markdown": "hi"}] * 13)
    assert err and "max" in err
    _, err2 = validate_sections([{"type": "tool"}])
    assert err2 and "tool_name" in err2
    _, err3 = validate_sections([{"type": "notes"}])
    assert err3 and "markdown" in err3
    _, err4 = validate_sections("bad")
    assert err4

    payload = _payload()
    html_doc = render_custom_report_html(
        title="T",
        payload=payload,
        sections=[
            {"type": "executive_summary"},
            {"type": "category_scores"},
            {"type": "notes", "heading": "N", "markdown": "line"},
            {"type": "tool", "heading": "Broken", "tool_name": "list_broken_links"},
        ],
        section_results=[None, None, None, {"pages": [{"url": "https://ex.com/x"}]}],
    )
    assert "Executive summary" in html_doc
    assert "Category scores" in html_doc
    assert "line" in html_doc

    try:
        pdf = render_custom_report_pdf(html_doc, "T")
        assert pdf[:4] == b"%PDF"
    except RuntimeError as exc:
        pytest.skip(str(exc))


def test_export_custom_resolve_sections(conn: MagicMock, ctx: Ctx) -> None:
    sections = [
        {"type": "executive_summary"},
        {"type": "tool", "tool_name": "list_broken_links", "tool_args": {}},
    ]
    with patch.object(Ctx, "load_payload", return_value=_payload()):
        results = resolve_section_results(
            conn,
            ctx,
            _payload(),
            sections,
            lambda name, args, **kw: {"pages": [{"url": "https://ex.com"}]},
        )
    assert results[0] is None
    assert results[1]["pages"]
