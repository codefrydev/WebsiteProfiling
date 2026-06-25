"""CLI: enrich command."""
from __future__ import annotations

import argparse
import sys

from ..analysis import merge_analysis_into_payload, merge_bundles, run_local_enrichment
from ..db import db_session, get_latest_crawl_run_id, read_crawl, read_report_payload, write_report_payload
from ..llm_client_http import run_llm_enrichment
from ..llm_config import load_llm_config_from_db, llm_is_enabled


def run(cfg: dict, args: argparse.Namespace) -> None:
    print("Site Audit: content analysis only (updates latest audit payload)...", flush=True)

    with db_session() as conn:
        run_id = get_latest_crawl_run_id(conn)
        df = read_crawl(conn, run_id)
        payload = read_report_payload(conn)
        if not payload:
            print("No report_payload in DB. Run report first.", file=sys.stderr)
            sys.exit(1)
        local_bundle = run_local_enrichment(df, cfg)
        llm_cfg = load_llm_config_from_db()
        llm_bundle = run_llm_enrichment(df, llm_cfg) if llm_is_enabled(llm_cfg) else {}
        bundle = merge_bundles(local_bundle, llm_bundle)
        merge_analysis_into_payload(payload, bundle)
        write_report_payload(conn, payload)
    print("Enrich done. New report_payload row written.", flush=True)
    sys.exit(0)
