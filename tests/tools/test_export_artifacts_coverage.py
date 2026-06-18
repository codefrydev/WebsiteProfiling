"""Line-coverage tests for export_artifacts edge paths."""
from __future__ import annotations

import pytest

from website_profiling.tools import export_artifacts




def test_export_artifacts_edge_cases(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    assert export_artifacts.read_artifact_meta("not-a-uuid") is None
    env = export_artifacts.save_artifact(b"x", filename="b.bin", mime_type="application/octet-stream", meta={"k": 1})
    meta_path = tmp_path / "exports" / f"{env['artifact_id']}.meta.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        f.write("{not json")
    assert export_artifacts.sweep_expired_artifacts() >= 0
    assert export_artifacts.rows_from_tool_result({"error": "x"}) == []
    assert export_artifacts.rows_from_tool_result({"pages": ["a", {"url": "b"}]})[0]["value"] == "a"
    assert export_artifacts.rows_from_tool_result({"broken": [{"url": "https://x.com"}]})[0]["url"] == "https://x.com"
    assert export_artifacts.dicts_to_csv([]) == ""
    assert export_artifacts.dicts_to_csv([{}]) == ""
    csv_filtered = export_artifacts.dicts_to_csv([{"a": 1, "b": 2}], columns=[" ", "a"])
    assert "a" in csv_filtered and "1" in csv_filtered
