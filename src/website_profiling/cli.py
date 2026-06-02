"""
CLI: read config file and run crawl, report, or plot.
"""
import argparse
import os
import shutil
import sys
import tempfile

import pandas as pd

from .config import get_bool, get_float, get_int, get_list, load_config, load_config_from_db


def _shadow_config_path() -> str:
    from .db.storage import get_data_dir
    return os.path.join(get_data_dir(), "pipeline-config.txt")


def _require_database_url() -> None:
    from .db.storage import get_database_url
    get_database_url()


def _lighthouse_work_dir() -> str:
    """Ephemeral directory for Lighthouse CLI JSON; deleted after PostgreSQL write."""
    return tempfile.mkdtemp(prefix="wp-lighthouse-")


def _cleanup_lighthouse_work_dir(work_dir: str) -> None:
    if not work_dir:
        return
    tmp_root = os.path.realpath(tempfile.gettempdir())
    if os.path.realpath(work_dir).startswith(tmp_root):
        shutil.rmtree(work_dir, ignore_errors=True)


def _google_db_has_gsc() -> bool:
    """True when the latest google_data row contains usable Search Console query data."""
    from .db.storage import _parse_json_field

    from .db import db_session

    try:
        with db_session() as conn:
            cur = conn.execute("SELECT data FROM google_data ORDER BY id DESC LIMIT 1")
            row = cur.fetchone()
            if not row:
                return False
            data = _parse_json_field(row["data"])
            if not isinstance(data, dict):
                return False
            gsc = data.get("gsc_full") or {}
            return bool(gsc.get("top_queries") or gsc.get("by_page"))
    except Exception:
        return False


def _should_enrich_keywords_after_report(cfg: dict) -> bool:
    """Default follows enable_google_search_console when enrich_keywords_after_report is omitted."""
    if "enrich_keywords_after_report" in cfg:
        return get_bool(cfg, "enrich_keywords_after_report", False)
    return get_bool(cfg, "enable_google_search_console", False)


def _resolved_start_url(cfg: dict) -> str:
    return (cfg.get("start_url") or "").strip()


def _resolved_lighthouse_url(cfg: dict) -> str:
    return (cfg.get("lighthouse_url") or "").strip() or _resolved_start_url(cfg)


def _require_start_url(cfg: dict, *, for_step: str) -> str:
    url = _resolved_start_url(cfg)
    if not url:
        print(
            f"Error: start_url is required for {for_step}. "
            "Set it in the Pipeline runner UI (Start URL) or pipeline-config.txt.",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


def _require_lighthouse_url(cfg: dict) -> str:
    url = _resolved_lighthouse_url(cfg)
    if not url:
        print(
            "Error: lighthouse_url or start_url is required for Lighthouse. "
            "Set Start URL in the Pipeline runner UI.",
            file=sys.stderr,
        )
        sys.exit(1)
    return url


def main() -> None:
    parser = argparse.ArgumentParser(
        description="WebsiteProfiling: crawl site, generate reports and link graph. All options read from config file."
    )
    parser.add_argument(
        "--config",
        "-c",
        default=None,
        help="Optional key=value config file (default: pipeline_config in PostgreSQL)",
    )
    parser.add_argument(
        "command",
        nargs="?",
        choices=["crawl", "report", "plot", "lighthouse", "keywords", "warnings", "enrich", "google"],
        help="Run only this step (default: run all steps according to config)",
    )
    parser.add_argument(
        "--test",
        action="store_true",
        help="For 'google' command: validate credentials and API access without storing data.",
    )
    parser.add_argument(
        "--list-properties",
        action="store_true",
        dest="list_properties",
        help="For 'google' command: print accessible GSC sites and GA4 properties as JSON.",
    )
    parser.add_argument(
        "--enrich-google",
        action="store_true",
        dest="enrich_google",
        help="For 'keywords' command: run Google enrichment (Suggest, GSC merge, Datamuse, etc.) without re-running the crawl.",
    )
    parser.add_argument(
        "--expand-only",
        action="store_true",
        dest="expand_only",
        help="For 'keywords' command: only run Suggest expansion and print JSON to stdout.",
    )
    args = parser.parse_args()

    # --- Config resolution order ---
    # 1. --config path: load that file (CLI override).
    # 2. pipeline_config table in PostgreSQL (UI-managed; DATABASE_URL).
    # 3. Shadow pipeline-config.txt in DATA_DIR.
    # 4. Error with hint to save settings in the web UI.

    cfg: dict[str, str] = {}
    cwd: str = os.getcwd()

    if args.config:
        cfg_path = os.path.abspath(args.config)
        if not os.path.isfile(cfg_path):
            print(f"Config file not found: {cfg_path}", file=sys.stderr)
            sys.exit(1)
        cfg = load_config(cfg_path)
        cwd = os.path.dirname(cfg_path) or os.getcwd()
    else:
        try:
            _require_database_url()
        except RuntimeError as e:
            print(str(e), file=sys.stderr)
            sys.exit(1)
        cfg = load_config_from_db()
        from .db.storage import get_data_dir
        cwd = get_data_dir()
        if cfg:
            print("[Config] Loaded from pipeline_config table (PostgreSQL)", flush=True)
        else:
            shadow = _shadow_config_path()
            if os.path.isfile(shadow):
                cfg = load_config(shadow)
                cwd = os.path.dirname(shadow) or os.getcwd()
                print(f"[Config] Loaded from shadow file ({shadow})", flush=True)
            else:
                print(
                    "No pipeline config found. Open the web UI (Pipeline runner), "
                    "configure settings, and click Save — or pass --config path.",
                    file=sys.stderr,
                )
                sys.exit(1)

    def path(key: str, default: str) -> str:
        p = cfg.get(key, default)
        if not os.path.isabs(p):
            p = os.path.join(cwd, p)
        return p

    use_database = True

    # Single-command mode: lighthouse, keywords, warnings
    if args.command == "lighthouse":
        print("WebsiteProfiling: lighthouse only", flush=True)
        from .lighthouse.runner import main as lighthouse_main
        lh_url = _require_lighthouse_url(cfg)
        lh_strategy = (cfg.get("lighthouse_strategy") or "mobile").lower()
        if lh_strategy not in ("mobile", "desktop"):
            lh_strategy = "mobile"
        lh_mode = (cfg.get("lighthouse_mode") or "navigation").strip().lower() or "navigation"
        lh_categories = cfg.get("lighthouse_categories", "").strip()
        lh_categories = get_list(cfg, "lighthouse_categories", sep=",") if lh_categories else None
        lh_iterations = get_int(cfg, "lighthouse_iterations", 3) or 3
        lh_out = _lighthouse_work_dir()
        try:
            sys.exit(
                lighthouse_main(
                    url=lh_url,
                    strategy=lh_strategy,
                    iterations=lh_iterations,
                    output_dir=lh_out,
                    use_database=use_database,
                    mode=lh_mode,
                    categories=lh_categories,
                )
            )
        finally:
            _cleanup_lighthouse_work_dir(lh_out)
    if args.command == "keywords":
        # --expand-only: just run Suggest expansion and print JSON to stdout
        if getattr(args, "expand_only", False):
            import json as _json
            from .integrations.google.suggest import batch_expand as _expand
            seeds_raw = (cfg.get("keyword_seeds") or "").strip()
            seeds = [s.strip() for s in seeds_raw.split(",") if s.strip()]
            if not seeds:
                print(_json.dumps({"error": "No keyword_seeds configured"}))
                sys.exit(1)
            result = _expand(seeds, sources=("web", "youtube", "questions"))
            print(_json.dumps(result, ensure_ascii=False), flush=True)
            sys.exit(0)

        # --enrich-google: skip crawl-based extraction, go straight to enrichment
        if getattr(args, "enrich_google", False):
            print("WebsiteProfiling: keywords Google enrichment only...", flush=True)
            from .integrations.google.keyword_enrich import run_enrichment
            try:
                run_enrichment(cfg)
                print("Keywords enrichment done.", flush=True)
                sys.exit(0)
            except Exception as e:
                print(f"Keywords enrichment error: {e}", file=sys.stderr)
                sys.exit(1)

        print("WebsiteProfiling: keywords only", flush=True)
        from .tools.keywords import main as keyword_main
        kw_url = _require_start_url(cfg, for_step="keywords")
        kw_cfg = dict(cfg)
        rc = keyword_main(base_url=kw_url, config=kw_cfg)
        if rc == 0 and (
            get_bool(cfg, "enable_google_suggest", False) or _google_db_has_gsc()
        ):
            print("  Running Google keyword enrichment...", flush=True)
            from .integrations.google.keyword_enrich import run_enrichment
            try:
                run_enrichment(cfg)
            except Exception as e:
                print(f"  Warning: Google enrichment error (non-fatal): {e}", file=sys.stderr)
        sys.exit(rc)
    if args.command == "warnings":
        print("WebsiteProfiling: warning mapper only", flush=True)
        from .tools.warnings import main as warning_mapper_main
        wm_input = cfg.get("warning_mapper_input", "").strip()
        wm_type = (cfg.get("warning_mapper_input_type") or "lighthouse").lower()
        if wm_input and not os.path.isabs(wm_input):
            wm_input = os.path.join(cwd, wm_input)
        sys.exit(warning_mapper_main(input_path=wm_input or None, input_type=wm_type))

    if args.command == "enrich":
        print("WebsiteProfiling: enrich only (updates latest report payload)...", flush=True)
        from .db import db_session, get_latest_crawl_run_id, read_crawl, read_report_payload, write_report_payload
        from .analysis import merge_analysis_into_payload, merge_bundles, run_local_enrichment
        from .llm.enrich import run_llm_enrichment
        from .llm_config import load_llm_config_from_db, llm_is_enabled

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

    if args.command == "google":
        from .integrations.google.auth import build_credentials, read_secrets
        from .integrations.google.fetch import fetch_google_data, list_properties

        credentials_path = cfg.get("google_credentials_path", "").strip()
        if credentials_path and not os.path.isabs(credentials_path):
            credentials_path = os.path.join(cwd, credentials_path)

        # --list-properties: print GSC sites + GA4 properties as JSON and exit
        if getattr(args, "list_properties", False):
            try:
                props = list_properties(credentials_path or None)
                import json as _json
                print(_json.dumps(props), flush=True)
                sys.exit(0)
            except Exception as e:
                print(f"Error listing properties: {e}", file=sys.stderr)
                sys.exit(1)

        # --test: validate credentials + API access without storing data
        if getattr(args, "test", False):
            print("WebsiteProfiling: Google credentials test...", flush=True)
            warnings: list[str] = []
            try:
                import google.auth.exceptions as _gae
                creds = build_credentials(credentials_path or None)
                print("  Google credentials: OK (token refreshed)", flush=True)

                secrets = read_secrets(credentials_path or None)
                gsc_site_url = secrets.get("gscSiteUrl", "")
                ga4_property_id = secrets.get("ga4PropertyId", "")

                if gsc_site_url:
                    from .integrations.google.gsc import (
                        describe_gsc_site_mismatch,
                        list_gsc_sites,
                        probe_gsc_site,
                        resolve_gsc_site_url,
                    )
                    sites = list_gsc_sites(creds)
                    print(f"  GSC: found {len(sites)} accessible site(s): {sites}", flush=True)
                    resolved, site_error = resolve_gsc_site_url(gsc_site_url, sites)
                    if resolved:
                        if resolved != gsc_site_url:
                            print(
                                f"  GSC: NOTE -- Configured '{gsc_site_url}' will use '{resolved}' "
                                "(Search Console requires an exact property URL). "
                                "Save the exact URL from 'Load from account' to avoid this note.",
                                flush=True,
                            )
                        ok, probe_msg = probe_gsc_site(creds, resolved)
                        if ok:
                            print(f"  GSC: OK -- {probe_msg}", flush=True)
                        else:
                            print(f"  GSC: ERROR -- {probe_msg}", flush=True)
                            warnings.append(probe_msg)
                    else:
                        detail = site_error or describe_gsc_site_mismatch(gsc_site_url, sites)
                        print(f"  GSC: ERROR -- {detail}", flush=True)
                        warnings.append(detail)
                else:
                    print(
                        "  GSC: skipped (no gscSiteUrl configured — set Website in Search Console in Integrations)",
                        flush=True,
                    )
                    warnings.append("GSC site URL is not configured.")

                if ga4_property_id:
                    from .integrations.google.ga4 import list_ga4_properties, probe_ga4_property
                    props, list_error = list_ga4_properties(creds)
                    if list_error:
                        print(f"  GA4: NOTE -- {list_error}", flush=True)
                    elif props:
                        names = [f"{p['displayName']} ({p['id']})" for p in props]
                        print(f"  GA4: found {len(props)} accessible propert(ies): {names}", flush=True)
                    ok, probe_msg = probe_ga4_property(creds, ga4_property_id)
                    if ok:
                        print(f"  GA4: OK -- {probe_msg}", flush=True)
                        if props and ga4_property_id not in [p["id"] for p in props]:
                            msg = (
                                f"Property {ga4_property_id} works via Data API but was not in the "
                                "account property list (listing may be incomplete)."
                            )
                            print(f"  GA4: NOTE -- {msg}", flush=True)
                    else:
                        print(f"  GA4: ERROR -- {probe_msg}", flush=True)
                        warnings.append(probe_msg)
                else:
                    print(
                        "  GA4: skipped (no ga4PropertyId configured — set Analytics property in Integrations)",
                        flush=True,
                    )
                    warnings.append("GA4 property ID is not configured.")

                if warnings:
                    print("", flush=True)
                    print("Google test completed with issues:", flush=True)
                    for i, w in enumerate(warnings, 1):
                        print(f"  {i}. {w}", flush=True)
                    print("", flush=True)
                    print(
                        "Data fetch will fail or return empty until these are fixed. "
                        "In Integrations: click 'Load from account', pick exact GSC site + GA4 property, Save, then Test again.",
                        flush=True,
                    )
                    sys.exit(1)

                print("Google test passed — GSC and GA4 are configured and reachable.", flush=True)
                sys.exit(0)
            except _gae.RefreshError:
                print(
                    "Google connection expired -- reconnect in Integrations.",
                    file=sys.stderr,
                )
                sys.exit(1)
            except Exception as e:
                print(f"Google test failed: {e}", file=sys.stderr)
                sys.exit(1)

        # Full fetch
        print("WebsiteProfiling: Google fetch...", flush=True)

        from .db import db_session, get_latest_crawl_run_id, read_crawl
        from .integrations.google.store import write_google_data

        date_range_days = get_int(cfg, "google_date_range_days", 28) or 28

        crawl_urls: list[str] = []
        start_url_for_join = cfg.get("start_url", "")
        try:
            with db_session() as conn:
                run_id = get_latest_crawl_run_id(conn)
                if run_id is not None:
                    df = read_crawl(conn, run_id)
                    if "url" in df.columns:
                        crawl_urls = df["url"].dropna().astype(str).str.strip().tolist()
        except Exception as e:
            print(f"  Warning: could not read crawl URLs for join stats: {e}", flush=True)

        try:
            import google.auth.exceptions as _gae
            google_data = fetch_google_data(
                credentials_path=credentials_path or None,
                date_range_days=date_range_days,
                crawl_urls=crawl_urls,
                start_url=start_url_for_join,
                config=cfg,
            )
        except _gae.RefreshError:
            print(
                "Google connection expired -- reconnect in Integrations.",
                file=sys.stderr,
            )
            sys.exit(1)
        except RuntimeError as e:
            print(f"Google fetch error: {e}", file=sys.stderr)
            sys.exit(1)

        # Store in google_data table
        with db_session() as conn:
            write_google_data(conn, google_data)

        if google_data.get("errors"):
            print("  Partial errors:", flush=True)
            for err in google_data["errors"]:
                print(f"    - {err}", flush=True)

        print("Google fetch done. Data stored in google_data table.", flush=True)
        sys.exit(0)

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
        from .crawl.crawler import run_crawler
        print("[Crawl] Starting...", flush=True)
        start_url = _require_start_url(cfg, for_step="crawl")
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

    # Run Lighthouse on every 200 OK page (when enabled); requires DB and crawl data
    lighthouse_summary_path_for_report = None
    if run_lighthouse_on_pages and use_database:
        from .db import db_session, get_latest_crawl_run_id, read_crawl
        from .lighthouse.runner import run_lighthouse_on_pages as do_lighthouse_on_pages
        print("[Lighthouse on pages] Starting...", flush=True)
        with db_session() as conn:
            run_id = get_latest_crawl_run_id(conn)
            df = read_crawl(conn, run_id)
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
            lh_out = _lighthouse_work_dir()
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
                _cleanup_lighthouse_work_dir(lh_out)
        print("[Lighthouse on pages] Done.", flush=True)

    # Run single-URL Lighthouse before report when enabled (and not running on all pages)
    if run_lighthouse and not run_lighthouse_on_pages:
        print("[Lighthouse] Starting...", flush=True)
        from .lighthouse.runner import main as lighthouse_main
        lh_url = _require_lighthouse_url(cfg)
        lh_strategy = (cfg.get("lighthouse_strategy") or "mobile").lower()
        if lh_strategy not in ("mobile", "desktop"):
            lh_strategy = "mobile"
        lh_mode = (cfg.get("lighthouse_mode") or "navigation").strip().lower() or "navigation"
        lh_categories = get_list(cfg, "lighthouse_categories", sep=",")
        lh_iterations = get_int(cfg, "lighthouse_iterations", 3) or 3
        lh_out = _lighthouse_work_dir()
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
            _cleanup_lighthouse_work_dir(lh_out)
        if exit_code != 0:
            sys.exit(exit_code)
        print("[Lighthouse] Done.", flush=True)
        lighthouse_summary_path_for_report = None

    if run_report:
        max_fetch = get_int(cfg, "max_fetch_for_edges", 300)
        same_domain = get_bool(cfg, "same_domain_only", True)
        max_nodes = get_int(cfg, "max_nodes_plot", 400)
        site_name = (cfg.get("site_name") or "").strip()
        report_title = (cfg.get("report_title") or "").strip()
        start_url = _require_start_url(cfg, for_step="report")
        run_security_scan_flag = get_bool(cfg, "run_security_scan", True)
        security_scan_active = get_bool(cfg, "security_scan_active", False)
        security_max_urls_probe = get_int(cfg, "security_max_urls_probe", 20) or 20
        from .reporting.builder import run_simple_report
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
            lighthouse_summary_path=lighthouse_summary_path_for_report,
            use_database=use_database,
            config=cfg,
        )
        print("[Report] Done.", flush=True)
        print(f"Report written: {out}")

        if _should_enrich_keywords_after_report(cfg) and _google_db_has_gsc():
            print("[Keywords] Post-report enrichment (GSC data found)...", flush=True)
            from .integrations.google.keyword_enrich import run_enrichment

            try:
                run_enrichment(cfg)
                print("[Keywords] Post-report enrichment done.", flush=True)
            except Exception as e:
                print(f"Warning: post-report keyword enrichment failed: {e}", file=sys.stderr)

    if run_plot:
        print("[Plot] Starting...", flush=True)
        from .tools.plot import run_plot as do_plot
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
