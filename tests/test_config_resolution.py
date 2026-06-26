"""CLI config resolution order."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_cli_exits_when_empty_db(tmp_path, monkeypatch):
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
    assert "No audit settings found" in combined
