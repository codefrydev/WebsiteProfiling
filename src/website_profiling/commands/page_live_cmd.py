"""CLI: page-live -- fetch live GSC/GA4 for one URL."""
from __future__ import annotations

import argparse
import json
import sys

from .config_resolve import resolve_config


def run(cfg: dict, cwd: str, args: argparse.Namespace) -> None:
    from ..integrations.google.page_live import fetch_page_live

    url = (getattr(args, "url", None) or "").strip()
    if not url:
        print("Error: --url is required", file=sys.stderr)
        sys.exit(1)

    persist = not getattr(args, "no_persist", False)

    try:
        from .config_resolve import resolve_property_id_from_cfg

        result = fetch_page_live(
            url,
            cfg,
            persist=persist,
            property_id=resolve_property_id_from_cfg(cfg),
        )
        print(json.dumps(result, default=str), flush=True)
        sys.exit(0 if result.get("ok") or result.get("gsc") or result.get("ga4") else 1)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
        sys.exit(1)
