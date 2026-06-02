"""CLI: warnings command."""
from __future__ import annotations

import argparse
import os
import sys

from .config_resolve import PathFn


def run(cfg: dict, cwd: str, path: PathFn, args: argparse.Namespace) -> None:
    print("WebsiteProfiling: warning mapper only", flush=True)
    from ..tools.warnings import main as warning_mapper_main

    wm_input = cfg.get("warning_mapper_input", "").strip()
    wm_type = (cfg.get("warning_mapper_input_type") or "lighthouse").lower()
    if wm_input and not os.path.isabs(wm_input):
        wm_input = os.path.join(cwd, wm_input)
    sys.exit(warning_mapper_main(input_path=wm_input or None, input_type=wm_type))
