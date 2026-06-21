"""CLI: page-coach -- AI suggestions for one page."""
from __future__ import annotations

import argparse
import json
import sys

from .config_resolve import resolve_config


def _parse_ref(raw: str) -> tuple[str | None, int | None]:
    """Parse a 'type:id' env value, tolerating a missing/non-numeric id.

    The bare ``":" in raw`` guard does not guarantee the right-hand side is an
    integer (e.g. "live:" or "snapshot:abc" from an unvalidated request body),
    so coerce defensively rather than letting int() raise and crash the command.
    """
    if ":" not in raw:
        return None, None
    type_part, _, id_part = raw.partition(":")
    try:
        return type_part, int(id_part)
    except ValueError:
        return None, None


def run(cfg: dict, cwd: str, args: argparse.Namespace) -> None:
    from ..llm.page_coach import run_page_coach

    url = (getattr(args, "url", None) or "").strip()
    if not url:
        print("Error: --url is required", file=sys.stderr)
        sys.exit(1)

    import os

    refresh = bool(getattr(args, "refresh", False))
    current_type, current_id = _parse_ref(os.environ.get("WP_PAGE_COACH_CURRENT", ""))
    baseline_type, baseline_id = _parse_ref(os.environ.get("WP_PAGE_COACH_BASELINE", ""))

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
