"""Tests for custom report builder."""
from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from website_profiling.tools.export_custom import (
    render_custom_report_html,
    render_custom_report_pdf,
    validate_sections,
)


def test_validate_sections_ok() -> None:
    sections, err = validate_sections([
        {"type": "executive_summary"},
        {"type": "notes", "heading": "Summary", "markdown": "Hello"},
        {"type": "tool", "heading": "Broken", "tool_name": "list_broken_links", "tool_args": {}},
    ])
    assert err is None
    assert sections is not None
    assert len(sections) == 3


def test_validate_sections_rejects_unknown_type() -> None:
    _, err = validate_sections([{"type": "unknown"}])
    assert err is not None


def test_render_custom_report_html() -> None:
    payload = {"site_name": "Example", "report_generated_at": "2026-06-07T12:00:00Z", "categories": []}
    html_doc = render_custom_report_html(
        title="Client Report",
        payload=payload,
        sections=[{"type": "notes", "heading": "Notes", "markdown": "Line one"}],
        section_results=[None],
    )
    assert "Client Report" in html_doc
    assert "Example" in html_doc
    assert "Line one" in html_doc


def test_render_custom_report_pdf_smoke() -> None:
    html_doc = "<html><body><p>Test</p></body></html>"
    try:
        pdf = render_custom_report_pdf(html_doc, "Test")
    except RuntimeError as exc:
        pytest.skip(str(exc))
    assert pdf[:4] == b"%PDF"
