"""CLI: extract markdown from stored page HTML for a crawl run."""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any


def run(cfg: dict[str, Any], args: argparse.Namespace) -> None:
    from ..page_markdown.pipeline import run_page_markdown_extraction
    from .config_resolve import active_property_id_from_cfg

    crawl_run_id = getattr(args, "crawl_run_id", None)
    strategy = getattr(args, "strategy", "main_only")
    overwrite = getattr(args, "overwrite", True)
    workers = getattr(args, "workers", 4)
    property_id = active_property_id_from_cfg(cfg)

    summary = run_page_markdown_extraction(
        crawl_run_id=crawl_run_id,
        strategy=strategy,
        workers=workers,
        overwrite=overwrite,
        property_id=property_id,
    )

    as_json = getattr(args, "as_json", False)
    if as_json:
        print(json.dumps(summary))
    else:
        print(f"[page-markdown] Done: {summary}", file=sys.stdout, flush=True)
