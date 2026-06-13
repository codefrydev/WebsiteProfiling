"""Data coverage report — which integrations and optional audit data are populated."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...db.property_store import get_property_by_id
from .context import AuditToolContext


def _check(name: str, populated: bool, hint: str = "") -> dict[str, Any]:
    return {"signal": name, "populated": populated, "config_hint": hint if not populated else ""}


def get_data_coverage_report(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required", "checks": []}

    prop = get_property_by_id(conn, scoped.property_id)
    if not prop:
        return {"error": "property not found", "checks": []}

    payload = scoped.load_payload(conn)
    google = scoped.load_google(conn)
    keywords = scoped.load_keywords(conn)
    gsc_links = scoped.load_gsc_links(conn)
    google_full = scoped.load_google_full(conn)

    checks: list[dict[str, Any]] = []
    checks.append(_check(
        "google_oauth",
        bool(prop.get("google_refresh_token")),
        "Connect Google OAuth in Integrations.",
    ))
    checks.append(_check(
        "gsc_data",
        bool(google and isinstance(google.get("gsc"), dict) and (google.get("gsc") or {}).get("summary")),
        "Map GSC site URL and re-run pipeline.",
    ))
    checks.append(_check(
        "ga4_data",
        bool(google and isinstance(google.get("ga4"), dict) and (google.get("ga4") or {}).get("summary")),
        "Connect GA4 property in Integrations.",
    ))
    checks.append(_check(
        "keyword_data",
        bool(keywords and (keywords.get("rows") or keywords.get("total_keywords"))),
        "Run keyword enrichment in pipeline.",
    ))
    checks.append(_check(
        "gsc_links_import",
        bool(gsc_links and (gsc_links.get("sample_links") or gsc_links.get("referring_domains"))),
        "Import GSC Links CSV in Backlinks view.",
    ))
    overlays = (gsc_links or {}).get("third_party_overlays") if isinstance(gsc_links, dict) else None
    checks.append(_check(
        "moz_majestic_overlay",
        bool(isinstance(overlays, list) and overlays),
        "Upload Moz or Majestic CSV in Backlinks > third-party overlay.",
    ))
    checks.append(_check(
        "image_inventory",
        bool(payload.get("image_inventory")),
        "Set probe_image_inventory=true in pipeline config and rebuild report.",
    ))
    checks.append(_check(
        "axe_violations",
        bool(payload.get("axe_audit_summary") or payload.get("axe_violations")),
        "Set enable_axe=true and use javascript/auto crawl rendering.",
    ))
    checks.append(_check(
        "rich_results_validation",
        bool(payload.get("rich_results_validation") or payload.get("rich_results_meta")),
        "Enable rich results validation on report build.",
    ))
    checks.append(_check(
        "audit_report",
        bool(payload),
        "Run a site audit crawl and report build.",
    ))
    checks.append(_check(
        "gsc_full_blob",
        bool(google_full and isinstance(google_full.get("gsc_full"), dict)),
        "Re-run Google fetch to populate gsc_full for list/decay tools.",
    ))
    checks.append(_check(
        "ga4_full_blob",
        bool(google_full and isinstance(google_full.get("ga4_full"), dict)),
        "Re-run GA4 fetch to populate ga4_full for landing-page list tools.",
    ))
    checks.append(_check(
        "keyword_history",
        bool(keywords and keywords.get("fetched_at")),
        "Run keyword enrichment twice for rank delta tools.",
    ))
    checks.append(_check(
        "text_content_analysis",
        bool(payload.get("text_content_analysis")),
        "Report build includes text_content_analysis from crawl.",
    ))
    checks.append(_check(
        "semantic_keyword_clusters",
        bool(payload.get("semantic_keyword_clusters")),
        "Enable llm_enable_keyword_clusters for cluster list tools.",
    ))
    checks.append(_check(
        "access_log",
        bool(payload.get("log_analysis") or payload.get("access_log_summary")),
        "Upload access logs in Integrations for log list tools.",
    ))
    from ...integrations.google.store import read_prior_google_snapshot
    prior_google = read_prior_google_snapshot(conn, scoped.property_id, skip=1) if scoped.property_id else None
    checks.append(_check(
        "prior_google_snapshot",
        bool(prior_google),
        "Run at least two Google data fetches for decay/compare period tools.",
    ))

    missing = [c["signal"] for c in checks if not c["populated"]]
    return {
        "property_id": scoped.property_id,
        "checks": checks,
        "missing_count": len(missing),
        "missing": missing,
        "provenance": {"sources": ["property", "google_data", "report_payload"], "confidence": "high"},
        "insights": [
            f"{len(checks) - len(missing)}/{len(checks)} data signals populated.",
            *(f"Enable: {m}" for m in missing[:5]),
        ],
    }
