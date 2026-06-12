"""Third-party integration audit tools: GSC inspection, Bing, SERP, AI citation."""
from __future__ import annotations

from typing import Any

from psycopg import Connection

from ...db.property_store import get_property_by_id
from ...integrations.google.auth import build_credentials
from ...integrations.google.gsc_inspection import inspect_url
from ._slice import cap_list, parse_limit
from .context import AuditToolContext


def _property_google_config(conn: Connection, property_id: int | None) -> tuple[dict[str, Any] | None, Any, str]:
    if property_id is None:
        return None, None, "property_id is required"
    prop = get_property_by_id(conn, property_id)
    if not prop:
        return None, None, "property not found"
    if not prop.get("google_refresh_token"):
        return None, None, "Google not connected — configure OAuth in Integrations"
    try:
        creds = build_credentials(property_id=property_id)
    except Exception as e:
        return None, None, f"Google credentials error: {e}"
    if not creds:
        return None, None, "Google not connected — configure OAuth in Integrations"
    gsc_site = str(prop.get("gsc_site_url") or prop.get("canonical_domain") or "").strip()
    if not gsc_site:
        return None, None, "GSC site URL not configured for property"
    return prop, creds, gsc_site


def get_gsc_url_inspection(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required", "missing": True}
    prop, creds, gsc_site = _property_google_config(conn, scoped.property_id)
    if prop is None or creds is None:
        return {"error": gsc_site, "missing": True}
    return inspect_url(creds, gsc_site, url)


def get_gsc_index_coverage(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Estimated indexation coverage from crawl + sitemap + GSC URL sets."""
    scoped = ctx.with_args(args)
    payload = scoped.load_payload(conn)
    if not payload:
        return {"error": "no report found", "missing": True}
    cov = payload.get("indexation_coverage")
    if not isinstance(cov, dict):
        return {"error": "indexation_coverage not in report", "missing": True}
    counts = cov.get("counts") if isinstance(cov.get("counts"), dict) else {}
    lists_total = cov.get("lists_total") if isinstance(cov.get("lists_total"), dict) else {}
    return {
        "counts": counts,
        "gap_totals": lists_total,
        "note": "Estimated from crawl, sitemap, and GSC URL join — not live Inspection API",
        "provenance": "Estimated",
    }


def get_bing_index_status(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    url = str(args.get("url") or "").strip()
    if not url:
        return {"error": "url is required", "missing": True}
    if scoped.property_id is None:
        return {"error": "property_id is required", "missing": True}
    prop = get_property_by_id(conn, scoped.property_id)
    if not prop:
        return {"error": "property not found", "missing": True}
    from ...db.config_store import read_pipeline_config

    known, _ = read_pipeline_config(conn)
    api_key = str(known.get("bing_webmaster_api_key") or "").strip()
    site_url = str(prop.get("gsc_site_url") or prop.get("canonical_domain") or "").strip()
    if not api_key:
        return {"error": "bing_webmaster_api_key not configured in audit settings", "missing": True}
    from ...integrations.bing.webmaster import _bing_json_get

    raw = _bing_json_get("GetUrlInfo", api_key, siteUrl=site_url, url=url)
    if raw.get("error"):
        return {"error": str(raw.get("error")), "missing": True, "provenance": "Bing Webmaster"}
    data = raw.get("d") if isinstance(raw.get("d"), dict) else raw
    return {"url": url, "bing": data, "provenance": "Bing Webmaster"}


def get_serp_feature_overlay(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    scoped = ctx.with_args(args)
    if scoped.property_id is None:
        return {"error": "property_id is required", "keywords": [], "missing": True}
    data = scoped.load_keywords(conn)
    if not data:
        return {"error": "no keyword data found", "keywords": [], "missing": True}
    rows = data.get("rows") or []
    with_features = [
        r for r in rows
        if isinstance(r, dict) and (
            r.get("serp_features") is not None
            or r.get("serp_estimated_competition") is not None
        )
    ]
    limit = parse_limit(args.get("limit"), 30, 50)
    sliced = cap_list(with_features, limit, max_cap=50)
    return {
        "keywords": sliced["items"],
        "total": sliced["total"],
        "truncated": sliced["truncated"],
        "serp_overlay_count": data.get("serp_overlay_count"),
        "provenance": "Estimated",
    }


def check_ai_citation_presence(conn: Connection, ctx: AuditToolContext, args: dict[str, Any]) -> dict[str, Any]:
    """Heuristic brand/domain citation readiness from on-site signals (no live LLM API)."""
    scoped = ctx.with_args(args)
    query = str(args.get("query") or args.get("brand") or "").strip()
    domain = scoped.resolve_property_domain(conn)
    if not query and not domain:
        return {"error": "query or brand is required", "missing": True}
    payload = scoped.load_payload(conn)
    brand_hits = 0
    for cat in payload.get("categories") or []:
        if not isinstance(cat, dict):
            continue
        for iss in cat.get("issues") or []:
            if isinstance(iss, dict) and query.lower() in str(iss.get("message") or "").lower():
                brand_hits += 1
    ner = payload.get("ner_site_summary") if isinstance(payload.get("ner_site_summary"), dict) else {}
    entities = ner.get("entities") or []
    entity_match = query.lower() in [str(e).lower() for e in entities] if query else False
    schema_cov = payload.get("schema_coverage") if isinstance(payload.get("schema_coverage"), dict) else {}
    return {
        "query": query or domain,
        "domain": domain,
        "entity_in_ner_summary": entity_match,
        "schema_pages": schema_cov.get("pages_with_schema"),
        "citation_readiness_note": "Live AI citation check requires external API — this is an on-site signal estimate",
        "provenance": "Estimated",
    }
