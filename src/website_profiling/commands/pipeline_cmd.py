"""CLI: full pipeline (crawl, lighthouse, report, plot) and single-step modes."""
from __future__ import annotations

import argparse
import sys
from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

import pandas as pd

from ..config import get_bool, get_float, get_int, get_list
from ..console_io import console_print
from ..progress import emit_phase_done, emit_phase_start, emit_progress
from .config_resolve import (
    active_property_id_from_cfg,
    cleanup_lighthouse_work_dir,
    google_db_has_gsc,
    lighthouse_work_dir,
    require_lighthouse_url,
    require_start_url,
    should_enrich_keywords_after_report,
)

_ALLOWED_RENDER_MODES = frozenset({"static", "javascript", "auto"})


@dataclass
class PhaseResult:
    name: str
    status: Literal["ok", "failed"]
    error: str | None = None


def run_pipeline_phase(name: str, fn: Callable[[], None]) -> PhaseResult:
    """Run one pipeline phase; failures are recorded and do not abort the process."""
    try:
        fn()
        return PhaseResult(name, "ok")
    except Exception as e:
        emit_progress(name, "error", message=str(e))
        console_print(f"[{name}] failed: {e}", file=sys.stderr)
        return PhaseResult(name, "failed", error=str(e))


def _normalize_render_mode(cfg: dict) -> str:
    mode = (cfg.get("crawl_render_mode") or "static").strip().lower()
    if mode not in _ALLOWED_RENDER_MODES:
        console_print(
            f"Warning: invalid crawl_render_mode {mode!r}; using static.",
            file=sys.stderr,
        )
        return "static"
    return mode


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


def select_lighthouse_urls_from_gsc(
    google_data: dict | None,
    crawl_urls: list[str],
    max_pages: int,
) -> list[str]:
    """Prefer top GSC pages by clicks that exist in crawl."""
    if not google_data or max_pages <= 0:
        return []
    gsc = google_data.get("gsc") if isinstance(google_data.get("gsc"), dict) else {}
    pages = gsc.get("pages") if isinstance(gsc.get("pages"), list) else []
    crawl_set = {u.rstrip("/") for u in crawl_urls}
    ranked: list[tuple[float, str]] = []
    for row in pages:
        if not isinstance(row, dict):
            continue
        url = str(row.get("page") or row.get("url") or "").strip()
        if not url:
            continue
        norm = url.rstrip("/")
        if norm not in crawl_set and url not in crawl_set:
            continue
        try:
            clicks = float(row.get("clicks") or 0)
        except (TypeError, ValueError):
            clicks = 0.0
        ranked.append((clicks, url))
    ranked.sort(key=lambda x: -x[0])
    picked = [u for _, u in ranked[:max_pages]]
    if picked:
        return picked
    return crawl_urls[:max_pages]


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
        emit_phase_start("config", message="Resolving pipeline configuration")
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
        console_print(f"Site Audit: {', '.join(steps)}", flush=True)
        emit_phase_done("config")

    phase_results: list[PhaseResult] = []

    if run_crawl:
        phase_results.append(run_pipeline_phase("crawl", lambda: _run_crawl(cfg, use_database)))

    if run_lighthouse_on_pages and use_database:
        phase_results.append(
            run_pipeline_phase(
                "lighthouse",
                lambda: _run_lighthouse_on_pages(cfg, lighthouse_max_pages),
            )
        )

    if run_lighthouse and not run_lighthouse_on_pages:
        phase_results.append(
            run_pipeline_phase(
                "lighthouse",
                lambda: _run_single_lighthouse(cfg, use_database),
            )
        )

    if run_report:
        phase_results.append(run_pipeline_phase("report", lambda: _run_report(cfg, use_database)))

    if run_plot:
        phase_results.append(run_pipeline_phase("plot", lambda: _run_plot(cfg, use_database)))

    _finalize_pipeline_run(phase_results)


def _finalize_pipeline_run(phase_results: list[PhaseResult]) -> None:
    """Exit non-zero only when a critical phase failed; optional phases warn instead."""
    failed = [r for r in phase_results if r.status == "failed"]
    if not failed:
        return
    names = ", ".join(r.name for r in failed)
    failed_names = {r.name for r in failed}
    report_ok = any(r.name == "report" and r.status == "ok" for r in phase_results)
    critical_failed = failed_names & {"crawl", "report"}
    if report_ok and not critical_failed:
        console_print(
            f"Pipeline completed with warnings (optional phase failures: {names})",
            file=sys.stderr,
        )
        return
    console_print(f"Pipeline finished with failures: {names}", file=sys.stderr)
    sys.exit(1)


def _run_crawl(cfg: dict, use_database: bool) -> None:
    from ..crawl.crawler import run_crawler

    console_print("[Crawl] Starting...", flush=True)
    emit_phase_start("crawl")
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
    property_id = active_property_id_from_cfg(cfg)
    render_mode = _normalize_render_mode(cfg)
    js_concurrency = get_int(cfg, "crawl_js_concurrency", 3) or 3
    js_timeout = get_int(cfg, "crawl_js_timeout", 30) or 30
    js_wait_until = (cfg.get("crawl_js_wait_until") or "domcontentloaded").strip()
    js_extra_wait_ms = get_int(cfg, "crawl_js_extra_wait_ms", 1500)
    if js_extra_wait_ms is None:
        js_extra_wait_ms = 1500
    js_block_resources = get_bool(cfg, "crawl_js_block_resources", True)
    capture_console = get_bool(cfg, "crawl_js_capture_console", True)
    js_console_levels = (cfg.get("crawl_js_console_levels") or "error,warning").strip()
    capture_failed_requests = get_bool(cfg, "crawl_js_capture_failed_requests", False)
    console_max_per_page = get_int(cfg, "crawl_js_console_max_per_page", 20) or 20
    custom_extraction_regex = (cfg.get("custom_extraction_regex") or "").strip()
    crawl_ignore_raw = (cfg.get("crawl_ignore_params") or "").strip()
    crawl_ignore_params = [p.strip() for p in crawl_ignore_raw.split(",") if p.strip()] or None
    from ..crawl.discovery import normalize_discovery_mode, parse_crawl_url_list

    discovery_mode = normalize_discovery_mode(cfg.get("crawl_discovery_mode"))
    crawl_url_list = parse_crawl_url_list(cfg.get("crawl_url_list"), start_url=start_url)
    from ..crawl.extraction import parse_extractors_config

    custom_extractors = parse_extractors_config(cfg.get("custom_extractors"))
    enable_axe = get_bool(cfg, "enable_axe", False)
    console_print("Crawling...")
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
        property_id=property_id,
        render_mode=render_mode,
        js_concurrency=js_concurrency,
        js_timeout=js_timeout,
        js_wait_until=js_wait_until,
        js_extra_wait_ms=js_extra_wait_ms,
        js_block_resources=js_block_resources,
        capture_console=capture_console,
        js_console_levels=js_console_levels,
        capture_failed_requests=capture_failed_requests,
        console_max_per_page=console_max_per_page,
        custom_extraction_regex=custom_extraction_regex,
        crawl_ignore_params=crawl_ignore_params,
        discovery_mode=discovery_mode,
        crawl_url_list=crawl_url_list or None,
        crawl_user_agent_preset=(cfg.get("crawl_user_agent_preset") or "default").strip(),
        crawl_user_agent_custom=(cfg.get("crawl_user_agent_custom") or "").strip(),
        crawl_auth_username=(cfg.get("crawl_auth_username") or "").strip(),
        crawl_auth_password=(cfg.get("crawl_auth_password") or "").strip(),
        crawl_extra_headers=(cfg.get("crawl_extra_headers") or "").strip(),
        crawl_cookies=(cfg.get("crawl_cookies") or "").strip(),
        crawl_robots_txt_override=(cfg.get("crawl_robots_txt_override") or "").strip(),
        custom_extractors=custom_extractors or None,
        enable_axe=enable_axe,
    )
    console_print("[Crawl] Done.", flush=True)
    emit_phase_done("crawl")
    console_print("Crawl results: PostgreSQL")


def _run_lighthouse_on_pages(cfg: dict, lighthouse_max_pages: int) -> None:
    from ..db import db_session, get_latest_crawl_run_id, read_crawl
    from ..lighthouse.runner import run_lighthouse_on_pages as do_lighthouse_on_pages

    console_print("[Lighthouse on pages] Starting...", flush=True)
    emit_phase_start("lighthouse", message="Lighthouse on pages")
    with db_session() as conn:
        run_id = get_latest_crawl_run_id(conn)
        df = read_crawl(conn, run_id)
        google_data = None
        try:
            from ..integrations.google.store import read_latest_google_data
            from .config_resolve import active_property_id_from_cfg

            google_data = read_latest_google_data(conn, property_id=active_property_id_from_cfg(cfg))
        except Exception:
            google_data = None
    crawl_urls = select_lighthouse_urls_from_crawl(df, lighthouse_max_pages * 3)
    urls_200 = select_lighthouse_urls_from_gsc(google_data, crawl_urls, lighthouse_max_pages)
    if not urls_200:
        urls_200 = select_lighthouse_urls_from_crawl(df, lighthouse_max_pages)
    if not urls_200:
        console_print("[Lighthouse on pages] No 200 OK URLs in crawl. Skip.", flush=True)
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
    console_print("[Lighthouse on pages] Done.", flush=True)
    emit_phase_done("lighthouse")


def _run_single_lighthouse(cfg: dict, use_database: bool) -> None:
    from ..lighthouse.runner import main as lighthouse_main

    console_print("[Lighthouse] Starting...", flush=True)
    emit_phase_start("lighthouse")
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
        raise RuntimeError(f"Lighthouse failed with exit code {exit_code}")
    console_print("[Lighthouse] Done.", flush=True)
    emit_phase_done("lighthouse")


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
    console_print("[Report] Starting...", flush=True)
    emit_phase_start("report")
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
    console_print("[Report] Done.", flush=True)
    emit_phase_done("report")
    console_print(f"Report written: {out}")

    if should_enrich_keywords_after_report(cfg) and google_db_has_gsc(cfg):
        console_print("[Keywords] Post-audit keyword research (Search Console data found)...", flush=True)
        emit_phase_start("keywords")
        from ..integrations.google.keyword_enrich import run_enrichment

        try:
            run_enrichment(cfg)
            console_print("[Keywords] Post-audit keyword research done.", flush=True)
            emit_phase_done("keywords")
        except Exception as e:
            console_print(f"Warning: post-audit keyword research failed: {e}", file=sys.stderr)
            emit_phase_done("keywords", message=f"keywords failed: {e}")


def _run_plot(cfg: dict, use_database: bool) -> None:
    from ..tools.plot import run_plot as do_plot

    console_print("[Plot] Starting...", flush=True)
    emit_phase_start("plot", message="Building charts and link graph")
    render_mode = (cfg.get("crawl_render_mode") or "").strip().lower() or None
    if render_mode is not None and render_mode not in _ALLOWED_RENDER_MODES:
        console_print(
            f"Warning: invalid crawl_render_mode {render_mode!r}; using crawl run default.",
            file=sys.stderr,
        )
        render_mode = None
    js_concurrency = get_int(cfg, "crawl_js_concurrency", 3) or 3
    js_timeout = get_int(cfg, "crawl_js_timeout", 30) or 30
    js_wait_until = (cfg.get("crawl_js_wait_until") or "domcontentloaded").strip()
    js_extra_wait_ms = get_int(cfg, "crawl_js_extra_wait_ms", 1500)
    if js_extra_wait_ms is None:
        js_extra_wait_ms = 1500
    js_block_resources = get_bool(cfg, "crawl_js_block_resources", True)
    try:
        e = do_plot(
            same_domain_only=get_bool(cfg, "same_domain_only", True),
            max_fetch_for_edges=get_int(cfg, "max_fetch_for_edges", 500),
            concurrency=8,
            timeout=10,
            polite_delay=0.15,
            use_database=use_database,
            render_mode=render_mode,
            js_timeout=js_timeout,
            js_concurrency=js_concurrency,
            js_wait_until=js_wait_until,
            js_extra_wait_ms=js_extra_wait_ms,
            js_block_resources=js_block_resources,
        )
        console_print("[Plot] Done.", flush=True)
        emit_phase_done("plot", message="Charts and link graph complete")
        console_print(f"Plot data: {e}")
    except Exception:
        emit_phase_done("plot", message="Charts step failed")
        raise
