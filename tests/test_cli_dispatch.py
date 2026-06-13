"""Smoke tests for CLI argument parsing."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def test_cli_help_lists_commands():
    proc = subprocess.run(
        [sys.executable, "-m", "src", "--help"],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert proc.returncode == 0
    for cmd in ("crawl", "content_analysis", "report", "plot", "lighthouse", "keywords", "warnings", "enrich", "google", "gsc-links-import"):
        assert cmd in proc.stdout
