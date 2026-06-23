"""Tests for report_loader list_reports field naming (snake_case for frontend)."""
from __future__ import annotations

from unittest.mock import MagicMock

from website_profiling.api.services.report_loader import list_reports


def test_list_reports_uses_snake_case_keys() -> None:
    row = {
        "id": 7,
        "canonical_domain": "example.com",
        "site_name": "Example",
        "generated_at": MagicMock(isoformat=lambda: "2026-01-01T00:00:00+00:00"),
    }
    conn = MagicMock()
    conn.execute.return_value.fetchall.return_value = [row]

    reports = list_reports(conn)
    assert len(reports) == 1
    assert reports[0] == {
        "id": 7,
        "canonical_domain": "example.com",
        "site_name": "Example",
        "generated_at": "2026-01-01T00:00:00+00:00",
    }
    assert "canonicalDomain" not in reports[0]
    assert "siteName" not in reports[0]
    assert "generatedAt" not in reports[0]
