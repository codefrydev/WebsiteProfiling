"""MCP domain server entry — set WP_MCP_DOMAIN before starting."""
from __future__ import annotations

import os

from .server import main


def run_domain_server(domain: str) -> None:
    os.environ["WP_MCP_DOMAIN"] = domain
    main()
