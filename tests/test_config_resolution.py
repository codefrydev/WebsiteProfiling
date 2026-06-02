"""CLI config resolution order."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_cli_exits_when_no_config_and_empty_db(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@127.0.0.1:59999/nodb")
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    proc = subprocess.run(
        [sys.executable, "-m", "src", "crawl"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert proc.returncode != 0
    combined = proc.stderr + proc.stdout
    assert "No pipeline config found" in combined or "Could not load pipeline_config" in combined


def test_cli_loads_config_file_override(tmp_path):
    cfg = tmp_path / "custom.txt"
    cfg.write_text("start_url = https://example.com\nsite_name = Example\n", encoding="utf-8")
    env = os.environ.copy()
    env["DATABASE_URL"] = "postgres://u:p@127.0.0.1:59999/nodb"
    proc = subprocess.run(
        [sys.executable, "-m", "src", "--config", str(cfg), "crawl"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=15,
        env=env,
    )
    # Should get past config load; may fail on crawl/network but not on missing config
    combined = proc.stderr + proc.stdout
    assert "Config file not found" not in combined
    assert "No pipeline config found" not in combined
