"""Smoke tests for vendored Wappalyzer fingerprints."""
from __future__ import annotations

import json
from pathlib import Path


def test_bundled_wappalyzer_technologies_json_loads():
    path = Path(__file__).resolve().parents[1] / "src" / "website_profiling" / "parsing" / "data" / "technologies.json"
    assert path.is_file()
    data = json.loads(path.read_text(encoding="utf-8"))
    assert "categories" in data
    assert "technologies" in data
    assert isinstance(data["technologies"], dict)
    assert len(data["technologies"]) > 100
