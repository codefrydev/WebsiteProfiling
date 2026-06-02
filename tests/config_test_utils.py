"""Shared helpers for config file tests."""
from __future__ import annotations

from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]


def parse_config_keys(path: Path) -> set[str]:
    keys: set[str] = set()
    text = path.read_text(encoding="utf-8")
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, _ = line.partition("=")
        elif ":" in line:
            key, _, _ = line.partition(":")
        else:
            continue
        key = key.strip()
        if key:
            keys.add(key)
    return keys
