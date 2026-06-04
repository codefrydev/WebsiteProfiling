"""CLI: lighthouse command."""
from __future__ import annotations

import argparse
import sys

from ..config import get_int, get_list
from .config_resolve import (
    cleanup_lighthouse_work_dir,
    lighthouse_work_dir,
    require_lighthouse_url,
)


def run(cfg: dict, args: argparse.Namespace) -> None:
    print("Site Audit: Lighthouse only", flush=True)
    from ..lighthouse.runner import main as lighthouse_main

    lh_url = require_lighthouse_url(cfg)
    lh_strategy = (cfg.get("lighthouse_strategy") or "mobile").lower()
    if lh_strategy not in ("mobile", "desktop"):
        lh_strategy = "mobile"
    lh_mode = (cfg.get("lighthouse_mode") or "navigation").strip().lower() or "navigation"
    lh_categories = cfg.get("lighthouse_categories", "").strip()
    lh_categories = get_list(cfg, "lighthouse_categories", sep=",") if lh_categories else None
    lh_iterations = get_int(cfg, "lighthouse_iterations", 3) or 3
    lh_out = lighthouse_work_dir()
    try:
        sys.exit(
            lighthouse_main(
                url=lh_url,
                strategy=lh_strategy,
                iterations=lh_iterations,
                output_dir=lh_out,
                use_database=True,
                mode=lh_mode,
                categories=lh_categories,
            )
        )
    finally:
        cleanup_lighthouse_work_dir(lh_out)
