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
