"""CLI chat — delegated to AiService (.NET)."""
from __future__ import annotations

import argparse
import sys


def run(cfg: dict, args: argparse.Namespace) -> None:
    _ = cfg, args
    print(
        "In-app chat is served by AiService (.NET). Use the web UI (/chat) or POST /api/chat via the BFF.",
        file=sys.stderr,
    )
    sys.exit(1)
