"""CLI: page-coach -- AI suggestions for one page."""
from __future__ import annotations

import argparse
import json
import sys

from .config_resolve import resolve_config


def run(cfg: dict, cwd: str, args: argparse.Namespace) -> None:
    from ..llm.page_coach import run_page_coach

    url = (getattr(args, "url", None) or "").strip()
    if not url:
        print("Error: --url is required", file=sys.stderr)
        sys.exit(1)

    import os

    refresh = bool(getattr(args, "refresh", False))
    current_type = current_id = baseline_type = baseline_id = None
    cur_env = os.environ.get("WP_PAGE_COACH_CURRENT", "")
    if ":" in cur_env:
        parts = cur_env.split(":", 1)
        current_type, current_id = parts[0], int(parts[1])
    base_env = os.environ.get("WP_PAGE_COACH_BASELINE", "")
    if ":" in base_env:
        parts = base_env.split(":", 1)
        baseline_type, baseline_id = parts[0], int(parts[1])

    result = run_page_coach(
        url,
        cfg,
        refresh=refresh,
        current_type=current_type,
        current_id=current_id,
        baseline_type=baseline_type,
        baseline_id=baseline_id,
    )
    print(json.dumps(result, default=str), flush=True)
    sys.exit(0 if result.get("ok") else 1)
