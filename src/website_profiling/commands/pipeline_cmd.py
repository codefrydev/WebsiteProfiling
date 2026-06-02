"""CLI: full pipeline (crawl, lighthouse, report, plot) and single-step modes."""
from __future__ import annotations

import argparse
import sys

import pandas as pd

from ..config import get_bool, get_float, get_int, get_list
from .config_resolve import (
    cleanup_lighthouse_work_dir,
    google_db_has_gsc,
    lighthouse_work_dir,
    require_lighthouse_url,
    require_start_url,
    should_enrich_keywords_after_report,
)


def select_lighthouse_urls_from_crawl(df: pd.DataFrame, max_pages: int) -> list[str]:
    if df.empty or "url" not in df.columns:
        return []
    if "status" not in df.columns:
        return []
    success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)]
    if success_df.empty:
        return []
    return (
        success_df["url"]
        .dropna()
        .astype(str)
        .str.strip()
        .loc[lambda s: s != ""]
        .unique()
        .tolist()[: max(0, int(max_pages or 0))]
    )


def run(cfg: dict, args: argparse.Namespace) -> None:
    use_database = True

    run_crawl = args.command == "crawl" or (args.command is None and get_bool(cfg, "run_crawl", True))
    run_report = args.command == "report" or (args.command is None and get_bool(cfg, "run_report", True))
    run_plot = args.command == "plot" or (args.command is None and get_bool(cfg, "run_plot", False))
    run_lighthouse = args.command is None and get_bool(cfg, "run_lighthouse", False)
    run_lighthouse_on_pages = args.command is None and get_bool(cfg, "run_lighthouse_on_pages", False)
    lighthouse_max_pages = get_int(cfg, "lighthouse_max_pages", 20) or 20

    if args.command is None and (
        run_crawl or run_lighthouse or run_lighthouse_on_pages or run_report or run_plot
    ):
        steps = []
        if run_crawl:
            steps.append("crawl")
        if run_lighthouse_on_pages:
            steps.append("lighthouse-on-pages")
        elif run_lighthouse:
            steps.append("lighthouse")
        if run_report:
            steps.append("report")
        if run_plot:
            steps.append("plot")
        print(f"WebsiteProfiling pipeline: {', '.join(steps)}", flush=True)

    if run_crawl:
        _run_crawl(cfg, use_database)

    if run_lighthouse_on_pages and use_database:
        _run_lighthouse_on_pages(cfg, lighthouse_max_pages)

    if run_lighthouse and not run_lighthouse_on_pages:
        _run_single_lighthouse(cfg, use_database)

    if run_report:
        _run_report(cfg, use_database)

    if run_plot:
        _run_plot(cfg, use_database)


def _run_crawl(cfg: dict, use_database: bool) -> None:
    from ..crawl.crawler import run_crawler

    print("[Crawl] Starting...", flush=True)
    start_url = require_start_url(cfg, for_step="crawl")
    max_pages = get_int(cfg, "max_pages")
    concurrency = get_int(cfg, "concurrency", 8)
    timeout = get_int(cfg, "timeout", 12)
    ignore_robots = get_bool(cfg, "ignore_robots", False)
    allow_external = get_bool(cfg, "allow_external", False)
    max_depth = get_int(cfg, "max_depth")
    polite_delay = get_float(cfg, "polite_delay", 0.2)
    store_outlinks = get_bool(cfg, "store_outlinks", True)
    exclude_urls = get_list(cfg, "crawl_exclude_urls", sep=",")
    preserve_crawl_history = get_bool(cfg, "preserve_crawl_history", True)
    store_content_excerpt = get_bool(cfg, "store_content_excerpt", False)
    content_excerpt_max_chars = get_int(cfg, "content_excerpt_max_chars", 4096) or 4096
    crawl_stream_to_db = get_bool(cfg, "crawl_stream_to_db", False)
    print("Crawling...")
    run_crawler(
        start_url=start_url,
        max_pages=max_pages,
        concurrency=concurrency,
        timeout=timeout,
        ignore_robots=ignore_robots,
        allow_external=allow_external,
        max_depth=max_depth,
        polite_delay=polite_delay,
        store_outlinks=store_outlinks,
        output_csv=None,
        output_db=use_database,
        show_progress=True,
        exclude_urls=exclude_urls if exclude_urls else None,
        preserve_crawl_history=preserve_crawl_history,
        store_content_excerpt=store_content_excerpt,
        content_excerpt_max_chars=content_excerpt_max_chars,
        crawl_stream_to_db=crawl_stream_to_db,
    )
    print("[Crawl] Done.", flush=True)
    print("Crawl results: PostgreSQL")


def _run_lighthouse_on_pages(cfg: dict, lighthouse_max_pages: int) -> None:
    from ..db import db_session, get_latest_crawl_run_id, read_crawl
    from ..lighthouse.runner import run_lighthouse_on_pages as do_lighthouse_on_pages

    print("[Lighthouse on pages] Starting...", flush=True)
    with db_session() as conn:
        run_id = get_latest_crawl_run_id(conn)
        df = read_crawl(conn, run_id)
    urls_200 = select_lighthouse_urls_from_crawl(df, lighthouse_max_pages)
    if not urls_200:
        print("[Lighthouse on pages] No 200 OK URLs in crawl. Skip.", flush=True)
    else:
        lh_strategy = (cfg.get("lighthouse_strategy") or "mobile").lower()
        if lh_strategy not in ("mobile", "desktop"):
            lh_strategy = "mobile"
        lh_mode = (cfg.get("lighthouse_mode") or "navigation").strip().lower() or "navigation"
        lh_categories = get_list(cfg, "lighthouse_categories", sep=",")
        lh_iterations = get_int(cfg, "lighthouse_iterations", 3) or 3
        lh_out = lighthouse_work_dir()
        try:
            do_lighthouse_on_pages(
                urls=urls_200,
                strategy=lh_strategy,
                iterations=lh_iterations,
                output_dir=lh_out,
                mode=lh_mode,
                categories=lh_categories if lh_categories else None,
                concurrency=get_int(cfg, "lighthouse_concurrency", 2) or 2,
            )
        finally:
            cleanup_lighthouse_work_dir(lh_out)
    print("[Lighthouse on pages] Done.", flush=True)


def _run_single_lighthouse(cfg: dict, use_database: bool) -> None:
    from ..lighthouse.runner import main as lighthouse_main

    print("[Lighthouse] Starting...", flush=True)
    lh_url = require_lighthouse_url(cfg)
    lh_strategy = (cfg.get("lighthouse_strategy") or "mobile").lower()
    if lh_strategy not in ("mobile", "desktop"):
        lh_strategy = "mobile"
    lh_mode = (cfg.get("lighthouse_mode") or "navigation").strip().lower() or "navigation"
    lh_categories = get_list(cfg, "lighthouse_categories", sep=",")
    lh_iterations = get_int(cfg, "lighthouse_iterations", 3) or 3
    lh_out = lighthouse_work_dir()
    try:
        exit_code = lighthouse_main(
            url=lh_url,
            strategy=lh_strategy,
            iterations=lh_iterations,
            output_dir=lh_out,
            use_database=use_database,
            mode=lh_mode,
            categories=lh_categories if lh_categories else None,
        )
    finally:
        cleanup_lighthouse_work_dir(lh_out)
    if exit_code != 0:
        sys.exit(exit_code)
    print("[Lighthouse] Done.", flush=True)


def _run_report(cfg: dict, use_database: bool) -> None:
    from ..reporting.builder import run_simple_report

    max_fetch = get_int(cfg, "max_fetch_for_edges", 300)
    same_domain = get_bool(cfg, "same_domain_only", True)
    max_nodes = get_int(cfg, "max_nodes_plot", 400)
    site_name = (cfg.get("site_name") or "").strip()
    report_title = (cfg.get("report_title") or "").strip()
    start_url = require_start_url(cfg, for_step="report")
    run_security_scan_flag = get_bool(cfg, "run_security_scan", True)
    security_scan_active = get_bool(cfg, "security_scan_active", False)
    security_max_urls_probe = get_int(cfg, "security_max_urls_probe", 20) or 20
    print("[Report] Starting...", flush=True)
    out = run_simple_report(
        max_fetch_for_edges=max_fetch,
        concurrency=6,
        timeout=8,
        same_domain_only=same_domain,
        max_nodes_plot=max_nodes or 300,
        site_name=site_name or None,
        report_title=report_title or None,
        start_url=start_url,
        run_security_scan_flag=run_security_scan_flag,
        security_scan_active=security_scan_active,
        security_max_urls_probe=security_max_urls_probe,
        lighthouse_summary_path=None,
        use_database=use_database,
        config=cfg,
    )
    print("[Report] Done.", flush=True)
    print(f"Report written: {out}")

    if should_enrich_keywords_after_report(cfg) and google_db_has_gsc():
        print("[Keywords] Post-report enrichment (GSC data found)...", flush=True)
        from ..integrations.google.keyword_enrich import run_enrichment

        try:
            run_enrichment(cfg)
            print("[Keywords] Post-report enrichment done.", flush=True)
        except Exception as e:
            print(f"Warning: post-report keyword enrichment failed: {e}", file=sys.stderr)


def _run_plot(cfg: dict, use_database: bool) -> None:
    from ..tools.plot import run_plot as do_plot

    print("[Plot] Starting...", flush=True)
    e = do_plot(
        same_domain_only=get_bool(cfg, "same_domain_only", True),
        max_fetch_for_edges=get_int(cfg, "max_fetch_for_edges", 500),
        concurrency=8,
        timeout=10,
        polite_delay=0.15,
        use_database=use_database,
    )
    print("[Plot] Done.", flush=True)
    print(f"Plot data: {e}")
