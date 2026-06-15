"""Lighthouse CLI configuration and command helpers."""
from __future__ import annotations

import os
import shutil
import subprocess
import threading
from pathlib import Path

# Lighthouse "good" thresholds for human summary
LCP_GOOD_MS = 2500
CLS_GOOD = 0.1
TBT_GOOD_MS = 200
FCP_GOOD_MS = 1800

_LIGHTHOUSE_INSTALL_MSG = (
    "Lighthouse not found. Install Node/npm (https://nodejs.org), then run: npm install -g lighthouse. "
    "Chrome or Chromium is also required for headless mode."
)

_NPX_LIGHTHOUSE_LOCK = threading.Lock()
_LIGHTHOUSE_FLOW_MODES = frozenset({"snapshot", "timespan"})

def _repo_root() -> str:
    explicit = (os.environ.get("WEBSITE_PROFILING_ROOT") or "").strip()
    if explicit:
        return explicit
    return str(Path(__file__).resolve().parents[3])


def _lighthouse_flow_script() -> str:
    return os.path.join(_repo_root(), "scripts", "lighthouse_user_flow.mjs")


def _normalize_lighthouse_mode(mode: str | None) -> str:
    m = (mode or "navigation").strip().lower() or "navigation"
    if m not in ("navigation", "snapshot", "timespan"):
        raise RuntimeError(
            f"Invalid lighthouse_mode {m!r}; use navigation, snapshot, or timespan."
        )
    return m


def _node_cmd() -> str:
    node = shutil.which("node")
    if node is None:
        raise RuntimeError(
            "Node.js not found. Install Node.js (https://nodejs.org) for Lighthouse user flows."
        )
    return node



