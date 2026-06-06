"""CLI: gsc-links-import command."""
from __future__ import annotations

import argparse
import json
import sys


def run(cfg: dict, args: argparse.Namespace) -> None:
    from ..db import db_session, get_latest_crawl_run_id, read_crawl
    from ..integrations.google.gsc_links_store import import_gsc_links_csv, read_gsc_links_status
    from .config_resolve import resolve_property_id_from_cfg

    property_id = getattr(args, "property_id", None)
    if not property_id:
        property_id = resolve_property_id_from_cfg(cfg)
    if not property_id:
        print("Error: --property-id is required.", file=sys.stderr)
        sys.exit(1)

    if getattr(args, "status", False):
        with db_session() as conn:
            status = read_gsc_links_status(conn, int(property_id))
        print(json.dumps(status), flush=True)
        sys.exit(0)

    csv_text = ""
    if getattr(args, "csv_stdin", False):
        csv_text = sys.stdin.read()
    elif getattr(args, "csv_file", None):
        with open(args.csv_file, encoding="utf-8-sig") as f:
            csv_text = f.read()
    else:
        print("Error: provide --csv-stdin or --csv-file.", file=sys.stderr)
        sys.exit(1)

    file_name = getattr(args, "file_name", None) or ""

    crawl_urls: list[str] = []
    try:
        with db_session() as conn:
            run_id = get_latest_crawl_run_id(conn)
            if run_id is not None:
                df = read_crawl(conn, run_id)
                if "url" in df.columns:
                    crawl_urls = df["url"].dropna().astype(str).str.strip().tolist()
    except Exception:
        pass

    try:
        with db_session() as conn:
            result = import_gsc_links_csv(
                conn,
                int(property_id),
                csv_text,
                crawl_urls=crawl_urls,
                file_name=file_name,
            )
        print(json.dumps(result), flush=True)
        sys.exit(0)
    except ValueError as e:
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
        sys.exit(1)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}), flush=True)
        sys.exit(1)
