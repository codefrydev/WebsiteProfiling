"""Tests for compare CSV export."""
from __future__ import annotations

from website_profiling.tools.export_compare import export_compare_issues_csv


def test_export_compare_issues_csv_added_removed() -> None:
    current = {
        "categories": [
            {
                "name": "Tech",
                "issues": [
                    {"url": "https://ex.com/a", "message": "gone", "priority": "High", "recommendation": "fix"},
                ],
            },
        ],
    }
    baseline = {
        "categories": [
            {
                "name": "Tech",
                "issues": [
                    {"url": "https://ex.com/b", "message": "new", "priority": "Medium", "recommendation": "fix b"},
                ],
            },
        ],
    }
    csv_text = export_compare_issues_csv(current, baseline)
    assert "removed" in csv_text
    assert "added" in csv_text
    assert "https://ex.com/a" in csv_text
    assert "https://ex.com/b" in csv_text
