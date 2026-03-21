"""
CLI: read config file and run crawl, report, or plot.
"""
import argparse
import os
import shutil
import sys

import pandas as pd

from .config import get_bool, get_float, get_int, get_list, load_config


def _config_path(default_name: str = "input.txt") -> str:
    return os.path.join(os.getcwd(), default_name)


_MODULE_COMMANDS = {
    "rank-tracker": ("src.rank_tracker", "main"),
    "keywords-explorer": ("src.keywords_explorer", "main"),
    "site-explorer": ("src.site_explorer", "main"),
    "gsc": ("src.gsc_integration", "main"),
    "analytics": ("src.web_analytics", "main"),
    "content": ("src.content_tools", "main"),
    "brand-radar": ("src.brand_radar", "main"),
    "competitive": ("src.competitive_intel", "main"),
    "social": ("src.social_media", "main"),
    "advertising": ("src.advertising", "main"),
    "local-seo": ("src.local_seo", "main"),
    "report-builder": ("src.report_builder", "main"),
    "alerts": ("src.alerts", "main"),
    "integrations": ("src.integrations", "main"),
    "sitemap": ("src.sitemap_gen", "main"),
    "log-analyzer": ("src.log_analyzer", "main"),
    "ai": ("src.ai_tools", "main"),
}


def main() -> None:
    # Dispatch to sub-module commands before the main config-based pipeline
    if len(sys.argv) > 1 and sys.argv[1] in _MODULE_COMMANDS:
        cmd = sys.argv[1]
        module_path, func_name = _MODULE_COMMANDS[cmd]
        import importlib
        try:
            mod = importlib.import_module(module_path)
            fn = getattr(mod, func_name)
            fn(sys.argv[2:])
        except Exception as e:
            print(f"Error running '{cmd}': {e}", file=sys.stderr)
            sys.exit(1)
        return

    parser = argparse.ArgumentParser(
        description=(
            "WebsiteProfiling: crawl site, generate reports and link graph. All options read from config file.\n\n"
            "Additional commands (pass after 'websiteprofiling <command> -- --help' for subcommand help):\n"
            + "\n".join(f"  {k}" for k in _MODULE_COMMANDS)
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--config",
        "-c",
        default=_config_path(),
        help="Path to input config file (default: input.txt in current directory)",
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=["crawl", "report", "plot", "lighthouse", "keywords", "warnings"],
        help="Run only this step (default: run all steps according to config)",
    )
    args = parser.parse_args()

    cfg_path = os.path.abspath(args.config)
    if not os.path.isfile(cfg_path):
        print(f"Config file not found: {cfg_path}", file=sys.stderr)
        print("Copy input.txt.example to input.txt and edit it, or pass --config path.", file=sys.stderr)
        sys.exit(1)

    cfg = load_config(cfg_path)
    cwd = os.path.dirname(cfg_path) or os.getcwd()

    def path(key: str, default: str) -> str:
        p = cfg.get(key, default)
        if not os.path.isabs(p):
            p = os.path.join(cwd, p)
        return p

    # When set, crawl/report/plot/lighthouse use SQLite instead of JSON/CSV
    sqlite_db_raw = (cfg.get("sqlite_db") or "").strip()
    db_path = path("sqlite_db", "report.db") if sqlite_db_raw else None

    # Single-command mode: lighthouse, keywords, warnings
    if args.command == "lighthouse":
        print("WebsiteProfiling: lighthouse only", flush=True)
        from .lighthouse_runner import main as lighthouse_main
        lh_url = cfg.get("lighthouse_url", cfg.get("start_url", "https://codefrydev.in"))
        lh_strategy = (cfg.get("lighthouse_strategy") or "mobile").lower()
        if lh_strategy not in ("mobile", "desktop"):
            lh_strategy = "mobile"
        lh_mode = (cfg.get("lighthouse_mode") or "navigation").strip().lower() or "navigation"
        lh_categories = cfg.get("lighthouse_categories", "").strip()
        lh_categories = get_list(cfg, "lighthouse_categories", sep=",") if lh_categories else None
        lh_iterations = get_int(cfg, "lighthouse_iterations", 3) or 3
        lh_out = cfg.get("lighthouse_output_dir", "").strip() or cwd
        if not os.path.isabs(lh_out):
            lh_out = os.path.join(cwd, lh_out)
        sys.exit(lighthouse_main(url=lh_url, strategy=lh_strategy, iterations=lh_iterations, output_dir=lh_out, db_path=db_path, mode=lh_mode, categories=lh_categories))
    if args.command == "keywords":
        print("WebsiteProfiling: keywords only", flush=True)
        from .keyword_tool import main as keyword_main
        kw_url = cfg.get("start_url", "https://codefrydev.in")
        kw_out = cfg.get("keyword_output_dir", "").strip() or cwd
        if not os.path.isabs(kw_out):
            kw_out = os.path.join(cwd, kw_out)
        kw_cfg = dict(cfg)
        kw_cfg["_cwd"] = cwd
        sys.exit(keyword_main(base_url=kw_url, output_dir=kw_out, config=kw_cfg))
    if args.command == "warnings":
        print("WebsiteProfiling: warning mapper only", flush=True)
        from .warning_mapper import main as warning_mapper_main
        wm_input = cfg.get("warning_mapper_input", "").strip()
        wm_type = (cfg.get("warning_mapper_input_type") or "lighthouse").lower()
        wm_out = cfg.get("warning_mapper_output", "").strip()
        if not wm_out:
            wm_out = os.path.join(cwd, "warnings_mapped.json")
        elif not os.path.isabs(wm_out):
            wm_out = os.path.join(cwd, wm_out)
        sys.exit(warning_mapper_main(input_path=wm_input, input_type=wm_type, output_path=wm_out))

    run_crawl = args.command == "crawl" or (args.command is None and get_bool(cfg, "run_crawl", True))
    run_report = args.command == "report" or (args.command is None and get_bool(cfg, "run_report", True))
    run_plot = args.command == "plot" or (args.command is None and get_bool(cfg, "run_plot", False))
    run_lighthouse = args.command is None and get_bool(cfg, "run_lighthouse", False)
    run_lighthouse_on_pages = args.command is None and get_bool(cfg, "run_lighthouse_on_pages", False)
    lighthouse_max_pages = get_int(cfg, "lighthouse_max_pages", 20) or 20

    if args.command is None and (run_crawl or run_lighthouse or run_lighthouse_on_pages or run_report or run_plot):
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
        from .crawler import run_crawler
        print("[Crawl] Starting...", flush=True)
        start_url = cfg.get("start_url", "https://codefrydev.in")
        max_pages = get_int(cfg, "max_pages")
        concurrency = get_int(cfg, "concurrency", 8)
        timeout = get_int(cfg, "timeout", 12)
        ignore_robots = get_bool(cfg, "ignore_robots", False)
        allow_external = get_bool(cfg, "allow_external", False)
        max_depth = get_int(cfg, "max_depth")
        polite_delay = get_float(cfg, "polite_delay", 0.2)
        store_outlinks = get_bool(cfg, "store_outlinks", True)
        exclude_urls = get_list(cfg, "crawl_exclude_urls", sep=",")
        preserve_crawl_history = get_bool(cfg, "preserve_crawl_history", False)
        crawl_output = path("crawl_output", "crawl_results.csv")
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
            output_csv=crawl_output if not db_path else None,
            output_db=db_path,
            show_progress=True,
            exclude_urls=exclude_urls if exclude_urls else None,
            preserve_crawl_history=preserve_crawl_history,
        )
        print("[Crawl] Done.", flush=True)
        print(f"Crawl results: {db_path or crawl_output}")
        crawl_csv = crawl_output
    else:
        crawl_csv = path("crawl_csv", "crawl_results.csv")
    edges_csv = path("edges_csv", "edges.csv")
    nodes_csv = path("nodes_csv", "nodes.csv")

    # Run Lighthouse on every 200 OK page (when enabled); requires DB and crawl data
    lighthouse_summary_path_for_report = None
    if run_lighthouse_on_pages and db_path:
        from .db import get_connection, get_latest_crawl_run_id, init_schema, read_crawl
        from .lighthouse_runner import run_lighthouse_on_pages as do_lighthouse_on_pages
        print("[Lighthouse on pages] Starting...", flush=True)
        conn = get_connection(db_path)
        init_schema(conn)
        run_id = get_latest_crawl_run_id(conn)
        df = read_crawl(conn, run_id)
        conn.close()
        success_df = df[df["status"].astype(str).str.match(r"2\d{2}", na=False)] if "status" in df.columns and not df.empty else pd.DataFrame()
        urls_200 = success_df["url"].dropna().astype(str).str.strip().unique().tolist()[:lighthouse_max_pages]
        if not urls_200:
            print("[Lighthouse on pages] No 200 OK URLs in crawl. Skip.", flush=True)
        else:
            lh_strategy = (cfg.get("lighthouse_strategy") or "mobile").lower()
            if lh_strategy not in ("mobile", "desktop"):
                lh_strategy = "mobile"
            lh_mode = (cfg.get("lighthouse_mode") or "navigation").strip().lower() or "navigation"
            lh_categories = get_list(cfg, "lighthouse_categories", sep=",")
            lh_iterations = get_int(cfg, "lighthouse_iterations", 3) or 3
            if run_lighthouse_on_pages:
                lh_iterations = 1
            lh_out = cfg.get("lighthouse_output_dir", "").strip() or cwd
            if not os.path.isabs(lh_out):
                lh_out = os.path.join(cwd, lh_out)
            do_lighthouse_on_pages(
                urls=urls_200,
                strategy=lh_strategy,
                iterations=lh_iterations,
                output_dir=lh_out,
                db_path=db_path,
                mode=lh_mode,
                categories=lh_categories if lh_categories else None,
            )
        print("[Lighthouse on pages] Done.", flush=True)

    # Run single-URL Lighthouse before report when enabled (and not running on all pages)
    if run_lighthouse and not run_lighthouse_on_pages:
        print("[Lighthouse] Starting...", flush=True)
        from .lighthouse_runner import main as lighthouse_main
        lh_url = cfg.get("lighthouse_url", cfg.get("start_url", "https://codefrydev.in"))
        lh_strategy = (cfg.get("lighthouse_strategy") or "mobile").lower()
        if lh_strategy not in ("mobile", "desktop"):
            lh_strategy = "mobile"
        lh_mode = (cfg.get("lighthouse_mode") or "navigation").strip().lower() or "navigation"
        lh_categories = get_list(cfg, "lighthouse_categories", sep=",")
        lh_iterations = get_int(cfg, "lighthouse_iterations", 3) or 3
        lh_out = cfg.get("lighthouse_output_dir", "").strip() or cwd
        if not os.path.isabs(lh_out):
            lh_out = os.path.join(cwd, lh_out)
        exit_code = lighthouse_main(url=lh_url, strategy=lh_strategy, iterations=lh_iterations, output_dir=lh_out, db_path=db_path, mode=lh_mode, categories=lh_categories if lh_categories else None)
        if exit_code != 0:
            sys.exit(exit_code)
        print("[Lighthouse] Done.", flush=True)
        lighthouse_summary_path_for_report = os.path.join(lh_out, "lighthouse_summary.json") if not db_path else None

    if run_report:
        if not db_path:
            print("Report requires sqlite_db. Set sqlite_db = report.db in input.txt. The React app in UI/ loads report.db.", file=sys.stderr)
            sys.exit(1)
        report_output = path("report_output", "site_report.html")
        max_fetch = get_int(cfg, "max_fetch_for_edges", 300)
        same_domain = get_bool(cfg, "same_domain_only", True)
        max_nodes = get_int(cfg, "max_nodes_plot", 400)
        site_name = (cfg.get("site_name") or "").strip()
        report_title = (cfg.get("report_title") or "").strip()
        start_url = cfg.get("start_url", "https://codefrydev.in")
        run_security_scan_flag = get_bool(cfg, "run_security_scan", True)
        security_scan_active = get_bool(cfg, "security_scan_active", False)
        security_max_urls_probe = get_int(cfg, "security_max_urls_probe", 20) or 20
        security_findings_output = (cfg.get("security_findings_output") or "").strip()
        if security_findings_output and not os.path.isabs(security_findings_output):
            security_findings_output = os.path.join(cwd, security_findings_output)
        elif not security_findings_output:
            security_findings_output = None
        lighthouse_summary_path = (cfg.get("lighthouse_summary_json") or "").strip()
        if lighthouse_summary_path and not os.path.isabs(lighthouse_summary_path):
            lighthouse_summary_path = os.path.join(cwd, lighthouse_summary_path)
        if not lighthouse_summary_path:
            lighthouse_summary_path = lighthouse_summary_path_for_report
        from .report import run_simple_report
        print("[Report] Starting...", flush=True)
        out = run_simple_report(
            crawl_csv=crawl_csv,
            edges_csv=edges_csv,
            output_html=report_output,
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
            security_findings_output=security_findings_output,
            lighthouse_summary_path=lighthouse_summary_path,
            db_path=db_path,
        )
        print("[Report] Done.", flush=True)
        print(f"Report written: {out}")
        # Copy to UI/public so the React app can load it at /report.db
        ui_public = os.path.join(cwd, "UI", "public")
        if os.path.isdir(ui_public):
            dest = os.path.join(ui_public, "report.db")
            try:
                shutil.copy2(out, dest)
                print(f"Copied report DB to {dest} for UI.")
            except OSError as e:
                print(f"Warning: could not copy report DB to UI/public: {e}", file=sys.stderr)

    if run_plot:
        plot_image = cfg.get("plot_image_output")
        if plot_image and not os.path.isabs(plot_image):
            plot_image = os.path.join(cwd, plot_image)
        print("[Plot] Starting...", flush=True)
        from .plot import run_plot as do_plot
        e, n = do_plot(
            crawl_csv=crawl_csv,
            edges_csv=edges_csv,
            nodes_csv=nodes_csv,
            image_output=plot_image or None,
            same_domain_only=get_bool(cfg, "same_domain_only", True),
            max_nodes_plot=get_int(cfg, "max_nodes_plot", 200) or 200,
            max_fetch_for_edges=get_int(cfg, "max_fetch_for_edges", 500),
            concurrency=8,
            timeout=10,
            polite_delay=0.15,
            db_path=db_path,
        )
        print("[Plot] Done.", flush=True)
        print(f"Edges: {e}, Nodes: {n}")
        if plot_image:
            print(f"Graph image: {plot_image}")
