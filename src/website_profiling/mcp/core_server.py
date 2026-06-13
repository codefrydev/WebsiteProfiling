"""MCP core router server (Tier 0 + insight tools)."""
from __future__ import annotations

from .domain_server import run_domain_server


def main() -> None:
    run_domain_server("core")
