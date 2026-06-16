"""Line-coverage tests for export_compare helpers."""
from __future__ import annotations

from website_profiling.tools.export_compare import export_compare_issues_csv




def test_export_compare_skips_bad_categories() -> None:
    current = {"categories": ["bad", {"name": "T", "issues": ["bad", {"url": "u", "message": "m"}]}]}
    baseline = {"categories": []}
    csv_text = export_compare_issues_csv(current, baseline)
    assert "removed" in csv_text
