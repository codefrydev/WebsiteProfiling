"""CLI: keywords command."""
from __future__ import annotations

import argparse
import sys

from ..config import get_bool
from .config_resolve import google_db_has_gsc, require_start_url


def run(cfg: dict, args: argparse.Namespace) -> None:
    if getattr(args, "expand_only", False):
        import json as _json

        from ..integrations.google.suggest import batch_expand as _expand

        seeds_raw = (cfg.get("keyword_seeds") or "").strip()
        seeds = [s.strip() for s in seeds_raw.split(",") if s.strip()]
        if not seeds:
            print(_json.dumps({"error": "No keyword_seeds configured"}))
            sys.exit(1)
        result = _expand(seeds, sources=("web", "youtube", "questions"))
        print(_json.dumps(result, ensure_ascii=False), flush=True)
        sys.exit(0)

    if getattr(args, "enrich_google", False):
        print("Site Audit: keyword research (Google Search Console) only...", flush=True)
        from ..integrations.google.keyword_enrich import run_enrichment

        try:
            run_enrichment(cfg)
            print("Keyword research done.", flush=True)
            sys.exit(0)
        except Exception as e:
            print(f"Keyword research error: {e}", file=sys.stderr)
            sys.exit(1)

    print("Site Audit: keywords only", flush=True)
    from ..tools.keywords import main as keyword_main

    kw_url = require_start_url(cfg, for_step="keywords")
    kw_cfg = dict(cfg)
    rc = keyword_main(base_url=kw_url, config=kw_cfg)
    if rc == 0 and (get_bool(cfg, "enable_google_suggest", False) or google_db_has_gsc(cfg)):
        print("  Running Google keyword research...", flush=True)
        from ..integrations.google.keyword_enrich import run_enrichment

        try:
            run_enrichment(cfg)
        except Exception as e:
            print(f"  Warning: Google keyword research error (non-fatal): {e}", file=sys.stderr)
    sys.exit(rc)
