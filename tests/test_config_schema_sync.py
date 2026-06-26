"""Legacy example config files removed; typed manifest is source of truth."""
from __future__ import annotations

from tests.config_test_utils import REPO_ROOT


def test_example_config_files_removed() -> None:
    assert not (REPO_ROOT / "input.txt.example").exists()
    assert not (REPO_ROOT / "pipeline-config.example.txt").exists()
