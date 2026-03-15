"""
CLI: read config file and run crawl, report, or plot.
"""
import argparse
import os
import sys

from .config import get_bool, get_float, get_int, load_config


def _config_path(default_name: str = "input.txt") -> str:
    return os.path.join(os.getcwd(), default_name)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="WebsiteProfiling: crawl site, generate reports and link graph. All options read from config file."
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
        choices=["crawl", "report", "plot"],
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

    run_crawl = args.command == "crawl" or (args.command is None and get_bool(cfg, "run_crawl", True))
    run_report = args.command == "report" or (args.command is None and get_bool(cfg, "run_report", True))
    run_plot = args.command == "plot" or (args.command is None and get_bool(cfg, "run_plot", False))

    if run_crawl:
        from .crawler import run_crawler
        start_url = cfg.get("start_url", "https://codefrydev.in")
        max_pages = get_int(cfg, "max_pages")
        concurrency = get_int(cfg, "concurrency", 8)
        timeout = get_int(cfg, "timeout", 12)
        ignore_robots = get_bool(cfg, "ignore_robots", False)
        allow_external = get_bool(cfg, "allow_external", False)
        max_depth = get_int(cfg, "max_depth")
        polite_delay = get_float(cfg, "polite_delay", 0.2)
        store_outlinks = get_bool(cfg, "store_outlinks", True)
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
            output_csv=crawl_output,
            show_progress=True,
        )
        print(f"Crawl results: {crawl_output}")
        crawl_csv = crawl_output
    else:
        crawl_csv = path("crawl_csv", "crawl_results.csv")
    edges_csv = path("edges_csv", "edges.csv")
    nodes_csv = path("nodes_csv", "nodes.csv")

    if run_report:
        report_output = path("report_output", "site_report.html")
        max_fetch = get_int(cfg, "max_fetch_for_edges", 300)
        same_domain = get_bool(cfg, "same_domain_only", True)
        max_nodes = get_int(cfg, "max_nodes_plot", 400)
        site_name = (cfg.get("site_name") or "").strip()
        report_title = (cfg.get("report_title") or "").strip()
        start_url = cfg.get("start_url", "https://codefrydev.in")
        from .report import run_simple_report
        print("Generating report...")
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
        )
        print(f"Report written: {out}")

    if run_plot:
        plot_image = cfg.get("plot_image_output")
        if plot_image and not os.path.isabs(plot_image):
            plot_image = os.path.join(cwd, plot_image)
        from .plot import run_plot as do_plot
        print("Building graph...")
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
        )
        print(f"Edges: {e}, Nodes: {n}")
        if plot_image:
            print(f"Graph image: {plot_image}")
