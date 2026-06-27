"""CLI help — delegated to AiService (.NET)."""
from __future__ import annotations

import argparse
import sys


def run(cfg: dict, args: argparse.Namespace) -> None:
    _ = cfg, args
    print(
        "Help chat is served by AiService (.NET). Use the web UI or configure AI in Run audit → AI settings.",
        file=sys.stderr,
    )
    sys.exit(1)
