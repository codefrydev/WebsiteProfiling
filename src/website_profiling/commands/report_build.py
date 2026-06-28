"""Shared report build execution for CLI and internal HTTP bridge."""
from __future__ import annotations

import os
import sys
from typing import Any

from ..commands.config_resolve import (
    active_property_id_from_cfg,
    google_db_has_gsc,
    require_start_url,
    should_enrich_keywords_after_report,
)
from ..config import get_bool, get_int
from ..console_io import console_print
from ..progress import emit_phase_done, emit_phase_start, emit_progress


def execute_report_build(cfg: dict, use_database: bool = True, run_keyword_enrich: bool = True) -> str:
    """Run report build + optional keyword enrich. Returns output path/identifier."""
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

    if run_keyword_enrich:
        _run_keyword_enrich_if_enabled(cfg)

    return out


def _run_keyword_enrich_if_enabled(cfg: dict) -> None:
    enable_planner = get_bool(cfg, "enable_google_keyword_planner", False)
    if not should_enrich_keywords_after_report(cfg) or not (
        google_db_has_gsc(cfg) or enable_planner
    ):
        return

    source_label = "Search Console" if google_db_has_gsc(cfg) else "Keyword Planner"
    console_print(f"[Keywords] Post-audit keyword research ({source_label} data)...", flush=True)
    emit_phase_start("keywords")
    integrations_url = (os.environ.get("INTEGRATIONS_SERVICE_URL") or "").strip().rstrip("/")
    property_id = active_property_id_from_cfg(cfg)
    try:
        if not integrations_url or not property_id:
            raise RuntimeError("IntegrationsService URL or property_id missing for keyword enrich")

        import json
        import urllib.request

        req = urllib.request.Request(
            f"{integrations_url}/internal/integrations/keywords/enrich",
            data=json.dumps({"propertyId": int(property_id)}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        if not result.get("ok"):
            raise RuntimeError(result.get("log") or "Keyword enrich failed")
        console_print("[Keywords] Post-audit keyword research done.", flush=True)
        emit_phase_done("keywords")
    except Exception as e:
        console_print(f"Warning: post-audit keyword research failed: {e}", file=sys.stderr)
        emit_progress("keywords", "error", message=str(e))


def load_config_for_property(
    conn: Any,
    property_id: int,
    crawl_run_id: int | None,
    config_override: dict[str, str] | None,
) -> dict[str, str]:
    from ..db.config_store import read_pipeline_config

    cfg, _unknown = read_pipeline_config(conn)
    if config_override:
        cfg.update({k: str(v) for k, v in config_override.items() if v is not None})
    cfg["active_property_id"] = str(property_id)
    if crawl_run_id is not None:
        cfg["_bridge_crawl_run_id"] = str(crawl_run_id)
    return cfg


def call_report_service(cfg: dict, property_id: int, crawl_run_id: int | None = None) -> dict[str, Any]:
    """POST report build to ReportService when REPORT_SERVICE_URL is set."""
    import json
    import urllib.error
    import urllib.request

    base = (os.environ.get("REPORT_SERVICE_URL") or "").strip().rstrip("/")
    if not base:
        raise RuntimeError("REPORT_SERVICE_URL is not set")

    body = {
        "propertyId": int(property_id),
        "crawlRunId": crawl_run_id,
        "config": {k: str(v) for k, v in cfg.items() if v is not None},
        "runKeywordEnrich": True,
    }
    req = urllib.request.Request(
        f"{base}/internal/report/build",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=1800) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ReportService HTTP {exc.code}: {detail}") from exc
    except urllib.error.URLError as exc:
        raise ConnectionError(str(exc.reason or exc)) from exc


def call_fastapi_report_bridge(cfg: dict, property_id: int, crawl_run_id: int | None = None) -> dict[str, Any]:
    """POST directly to FastAPI internal bridge (when ReportService is down)."""
    import json
    import urllib.error
    import urllib.request

    base = (os.environ.get("FASTAPI_URL") or "http://127.0.0.1:8096").strip().rstrip("/")
    body = {
        "propertyId": int(property_id),
        "crawlRunId": crawl_run_id,
        "config": {k: str(v) for k, v in cfg.items() if v is not None},
        "runKeywordEnrich": True,
    }
    req = urllib.request.Request(
        f"{base}/internal/report/build",
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=1800) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"FastAPI report bridge HTTP {exc.code}: {detail}") from exc


def build_report_resilient(
    cfg: dict,
    property_id: int | None,
    *,
    use_database: bool = True,
    crawl_run_id: int | None = None,
) -> str:
    """Try ReportService, then FastAPI bridge, then in-process build."""
    import urllib.error

    if property_id and _report_via_service():
        for label, caller in (
            ("ReportService", lambda: call_report_service(cfg, int(property_id), crawl_run_id)),
            ("FastAPI bridge", lambda: call_fastapi_report_bridge(cfg, int(property_id), crawl_run_id)),
        ):
            try:
                result = caller()
                if result.get("ok"):
                    return str(result.get("outputPath") or "report_payload")
                raise RuntimeError(result.get("log") or f"{label} build failed")
            except (ConnectionError, OSError, urllib.error.URLError) as exc:
                console_print(
                    f"Warning: {label} unavailable ({exc}); trying next report path.",
                    file=sys.stderr,
                )
            except Exception as exc:
                if label == "FastAPI bridge":
                    console_print(
                        f"Warning: {label} failed ({exc}); falling back to in-process report.",
                        file=sys.stderr,
                    )
                    break
                raise
    return execute_report_build(cfg, use_database=use_database, run_keyword_enrich=True)


def _report_via_service() -> bool:
    return bool((os.environ.get("REPORT_SERVICE_URL") or "").strip())
