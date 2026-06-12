"""Lighthouse report helpers and SSL certificate checks."""
from __future__ import annotations

import socket
import ssl
from datetime import datetime, timezone
from typing import Any, Optional
from urllib.parse import urlparse


def fetch_site_ssl_expires_iso(hostname: str, timeout: float = 5.0) -> Optional[str]:
    """Return certificate notAfter as ISO 8601 UTC, or None on failure."""
    host = (hostname or "").strip().lower()
    if not host:
        return None
    try:
        ctx = ssl.create_default_context()
        with socket.create_connection((host, 443), timeout=timeout) as sock:
            with ctx.wrap_socket(sock, server_hostname=host) as ssock:
                cert = ssock.getpeercert()
        if not cert:
            return None
        na = cert.get("notAfter")
        if not na:
            return None
        ts = ssl.cert_time_to_seconds(na)
        return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()
    except Exception:
        return None


def _strip_www(host: str) -> str:
    h = (host or "").strip().lower()
    return h[4:] if h.startswith("www.") else h


def _url_hostname(url: str) -> str:
    if not url:
        return ""
    try:
        return (urlparse(str(url).strip()).hostname or "").lower()
    except Exception:
        return ""


def _hosts_match(a: str, b: str) -> bool:
    if not a or not b:
        return False
    a, b = a.lower(), b.lower()
    return a == b or _strip_www(a) == _strip_www(b)


def filter_lighthouse_by_host(by_url: dict[str, Any], expected_host: str) -> dict[str, Any]:
    """Keep only Lighthouse entries whose URL hostname matches expected_host (www.-tolerant)."""
    if not by_url or not expected_host:
        return by_url or {}
    return {u: v for u, v in by_url.items() if _hosts_match(_url_hostname(u), expected_host)}


def _derive_expected_host(start_url: str, df) -> str:
    host = _url_hostname(start_url)
    if host:
        return host
    if df is not None and not df.empty and "url" in df.columns:
        for u in df["url"]:
            h = _url_hostname(str(u))
            if h:
                return h
    return ""


def _pick_lighthouse_summary(
    lighthouse_by_url: dict[str, Any],
    start_url: str,
    global_summary: Optional[dict[str, Any]],
    expected_host: str,
) -> Optional[dict[str, Any]]:
    """Prefer per-URL summary for this crawl; only use global summary if hostname matches."""
    if lighthouse_by_url and start_url:
        match = lighthouse_for_url(lighthouse_by_url, start_url)
        if match:
            return match
    if lighthouse_by_url:
        first_key = next(iter(lighthouse_by_url), None)
        if first_key is not None:
            return lighthouse_by_url[first_key]
    if global_summary:
        if not expected_host or _hosts_match(
            _url_hostname(str(global_summary.get("url") or "")), expected_host
        ):
            return global_summary
    return None


def build_lighthouse_by_url_for_report(conn: Any) -> dict[str, Any]:
    """
    Merge per-URL Lighthouse page summaries with latest lighthouse_runs row: full audits/items
    from normalized tables, uncapped top_failures and diagnostics from stored LHR JSON.
    """
    from ..db import (
        read_lh_audits_with_items,
        read_lh_runs_by_url,
        read_lighthouse_page_summaries,
        read_lighthouse_run_json,
    )
    from ..lighthouse.runner import _evidence_from_audit, extract_from_lighthouse_json
    from ..tools.warnings import parse_lighthouse_to_diagnostics, resolve_impact

    summaries = read_lighthouse_page_summaries(conn)
    runs_map = read_lh_runs_by_url(conn)

    summaries_norm: dict[str, Any] = {}
    for k, v in summaries.items():
        nk = str(k).strip().rstrip("/")
        summaries_norm[nk] = v

    all_urls = set(summaries_norm.keys()) | set(runs_map.keys())
    out: dict[str, Any] = {}

    for u in sorted(all_urls):
        base: dict[str, Any] = dict(summaries_norm[u]) if u in summaries_norm else {}
        run_ids = runs_map.get(u, [])
        run_id = run_ids[-1] if run_ids else None

        if run_id is not None:
            raw = read_lighthouse_run_json(conn, run_id)
            if not base and raw:
                ex = extract_from_lighthouse_json(raw)
                lr = raw.get("lighthouseResult") or raw
                final_u = lr.get("finalUrl") or lr.get("requestedUrl") or u
                base = {
                    "url": str(final_u).strip().rstrip("/"),
                    "median_metrics": {
                        "lcp_ms": ex.get("lcp_ms"),
                        "cls": ex.get("cls"),
                        "tbt_ms": ex.get("tbt_ms"),
                        "fcp_ms": ex.get("fcp_ms"),
                        "speed_index_ms": ex.get("speed_index_ms"),
                        "performance_score": ex.get("performance_score"),
                        "accessibility_score": ex.get("accessibility_score"),
                        "seo_score": ex.get("seo_score"),
                        "best_practices_score": ex.get("best_practices_score"),
                        "pwa_score": ex.get("pwa_score"),
                    },
                    "category_scores": dict(ex.get("category_scores") or {}),
                    "strategy": "mobile",
                    "device": "mobile",
                    "mode": "navigation",
                }
            base["audits"] = read_lh_audits_with_items(conn, run_id)
            if raw:
                lr = raw.get("lighthouseResult") or raw
                audits_map = lr.get("audits") or {}
                failures: list[dict[str, Any]] = []
                for aid, a in audits_map.items():
                    if not isinstance(a, dict):
                        continue
                    score = a.get("score")
                    if score is None or score >= 1:
                        continue
                    title = a.get("title") or aid
                    help_text = a.get("helpText") or ""
                    failures.append(
                        {
                            "id": aid,
                            "score": score,
                            "helpText": help_text,
                            "impact": resolve_impact(aid, title, help_text),
                            "evidence": _evidence_from_audit(a),
                        }
                    )
                failures.sort(key=lambda x: (x["score"] or 0))
                base["top_failures"] = failures
                base["diagnostics"] = parse_lighthouse_to_diagnostics(raw, max_nodes_in_refs=None)
        elif not base:
            continue

        if not base.get("url"):
            base["url"] = u
        out[u] = base

    return out


def lighthouse_for_url(lighthouse_by_url: dict[str, Any], url: str) -> Optional[dict[str, Any]]:
    """Resolve Lighthouse summary for a crawled URL (trailing-slash tolerant)."""
    if not lighthouse_by_url or not url:
        return None
    u = str(url).strip().rstrip("/")
    if u in lighthouse_by_url:
        return lighthouse_by_url[u]
    for k, v in lighthouse_by_url.items():
        if str(k).strip().rstrip("/") == u:
            return v
    return None
