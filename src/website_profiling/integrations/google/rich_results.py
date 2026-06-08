"""Optional Google Rich Results validation via crawl analysis or GSC URL Inspection."""
from __future__ import annotations

from typing import Any, Optional

_JSON_LD_CODES = frozenset({"json_ld_parse", "json_ld_missing_type"})


def _local_row(url: str, link: dict[str, Any] | None) -> dict[str, Any]:
    if not link:
        return {
            "url": url,
            "status": "skipped",
            "provenance": "Estimated",
            "message": "No crawl data for URL.",
        }
    pa = link.get("page_analysis")
    if not isinstance(pa, dict):
        pa = {}
    warnings = pa.get("warnings") if isinstance(pa.get("warnings"), list) else []
    schema_warnings = [
        w for w in warnings
        if isinstance(w, dict) and str(w.get("code") or "") in _JSON_LD_CODES
    ]
    has_schema = bool(link.get("has_schema"))
    schema_types = pa.get("json_ld_types") or pa.get("schema_types") or []
    if isinstance(schema_types, str):
        schema_types = [schema_types]

    if schema_warnings:
        first = schema_warnings[0]
        return {
            "url": url,
            "status": "warning",
            "provenance": "Crawl analysis",
            "message": str(first.get("message") or "JSON-LD issue detected during crawl."),
            "issues": [str(w.get("message") or w.get("code") or "warning") for w in schema_warnings[:5]],
        }
    if has_schema and not schema_types:
        return {
            "url": url,
            "status": "warning",
            "provenance": "Crawl analysis",
            "message": "Structured data detected but JSON-LD @type could not be parsed.",
        }
    if has_schema:
        types = ", ".join(str(t) for t in schema_types[:5])
        return {
            "url": url,
            "status": "pass",
            "provenance": "Crawl analysis",
            "message": f"JSON-LD present ({types or 'types unknown'}).",
            "schema_types": list(schema_types)[:10],
        }
    return {
        "url": url,
        "status": "info",
        "provenance": "Crawl analysis",
        "message": "No structured data detected on crawled HTML.",
    }


def _inspect_via_gsc(creds: Any, site_url: str, url: str) -> dict[str, Any]:
    from .gsc import _build_service, _call_with_retry, resolve_gsc_site_url, list_gsc_sites

    sites = list_gsc_sites(creds)
    resolved, err = resolve_gsc_site_url(site_url, sites)
    if not resolved:
        return {
            "url": url,
            "status": "error",
            "provenance": "Google Search Console",
            "message": err or "GSC site URL not accessible.",
        }
    service = _build_service(creds)
    body = {"inspectionUrl": url, "siteUrl": resolved}
    resp = _call_with_retry(
        lambda: service.urlInspection().index().inspect(body=body).execute()
    )
    inspection = resp.get("inspectionResult") or {}
    rich = inspection.get("richResultsResult") or {}
    verdict = str(rich.get("verdict") or "UNKNOWN")
    detected = rich.get("detectedItems") or []
    types: list[str] = []
    for item in detected:
        if isinstance(item, dict):
            rt = item.get("richResultType")
            if rt:
                types.append(str(rt))
    status = "pass"
    if verdict in ("FAIL", "ERROR"):
        status = "fail"
    elif verdict in ("PARTIAL", "WARN", "WARNING"):
        status = "warning"
    elif verdict in ("NEUTRAL", "UNKNOWN", "NOT_APPLICABLE"):
        status = "info"
    message = f"Rich Results verdict: {verdict}"
    if types:
        message += f" ({', '.join(types[:5])})"
    row: dict[str, Any] = {
        "url": url,
        "status": status,
        "provenance": "Google Search Console",
        "message": message,
        "verdict": verdict,
    }
    if types:
        row["schema_types"] = types[:10]
    issues = rich.get("issues") or []
    if issues:
        row["issues"] = [
            str(i.get("issueMessage") or i.get("severity") or i)
            for i in issues[:5]
            if isinstance(i, dict) or i
        ]
    return row


def validate_urls(
    urls: list[str],
    api_key: str | None = None,
    *,
    creds: Any = None,
    site_url: str | None = None,
    links_by_url: Optional[dict[str, dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    """Validate Rich Results for sample URLs.

    Uses GSC URL Inspection when OAuth credentials and site URL are available;
    otherwise falls back to crawl-time JSON-LD heuristics from link page_analysis.
    """
    del api_key  # reserved for future API-key based validators
    links_by_url = links_by_url or {}
    rows: list[dict[str, Any]] = []
    use_gsc = bool(creds and (site_url or "").strip())
    for url in urls[:50]:
        u = str(url or "").strip()
        if not u:
            continue
        if use_gsc:
            try:
                rows.append(_inspect_via_gsc(creds, str(site_url).strip(), u))
                continue
            except Exception as exc:
                link = links_by_url.get(u) or links_by_url.get(u.rstrip("/"))
                local = _local_row(u, link if isinstance(link, dict) else None)
                local["status"] = "error"
                local["message"] = f"GSC inspection failed: {exc}"
                rows.append(local)
                continue
        rows.append(_local_row(u, links_by_url.get(u) or links_by_url.get(u.rstrip("/"))))
    return rows
