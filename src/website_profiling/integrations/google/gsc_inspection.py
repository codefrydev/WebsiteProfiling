"""Google Search Console URL Inspection API helpers."""
from __future__ import annotations

from typing import Any


def inspect_url(creds: Any, site_url: str, url: str) -> dict[str, Any]:
    """Run GSC URL Inspection for one URL. Returns indexing + rich results slice."""
    from .gsc import _build_service, _call_with_retry, list_gsc_sites, resolve_gsc_site_url

    sites = list_gsc_sites(creds)
    resolved, err = resolve_gsc_site_url(site_url, sites)
    if not resolved:
        return {
            "ok": False,
            "url": url,
            "error": err or "GSC site URL not accessible.",
            "provenance": "Search Console",
        }
    service = _build_service(creds)
    body = {"inspectionUrl": url, "siteUrl": resolved}
    resp = _call_with_retry(
        lambda: service.urlInspection().index().inspect(body=body).execute()
    )
    inspection = resp.get("inspectionResult") or {}
    index_status = inspection.get("indexStatusResult") or {}
    rich = inspection.get("richResultsResult") or {}
    verdict = str(rich.get("verdict") or "UNKNOWN")
    detected = rich.get("detectedItems") or []
    types: list[str] = []
    for item in detected:
        if isinstance(item, dict) and item.get("richResultType"):
            types.append(str(item["richResultType"]))
    return {
        "ok": True,
        "url": url,
        "site_url": resolved,
        "indexing": {
            "verdict": index_status.get("verdict"),
            "coverage_state": index_status.get("coverageState"),
            "robots_txt_state": index_status.get("robotsTxtState"),
            "indexing_state": index_status.get("indexingState"),
            "last_crawl_time": index_status.get("lastCrawlTime"),
            "page_fetch_state": index_status.get("pageFetchState"),
        },
        "rich_results": {
            "verdict": verdict,
            "schema_types": types[:10],
            "issues": [
                str(i.get("issueMessage") or i.get("severity") or i)
                for i in (rich.get("issues") or [])[:5]
                if isinstance(i, dict)
            ],
        },
        "provenance": "Search Console",
    }


def inspect_url_rich_results_row(creds: Any, site_url: str, url: str) -> dict[str, Any]:
    """Compatibility wrapper matching rich_results.validate_urls row shape."""
    result = inspect_url(creds, site_url, url)
    if not result.get("ok"):
        return {
            "url": url,
            "status": "error",
            "provenance": "Google Search Console",
            "source": "gsc",
            "message": result.get("error") or "Inspection failed",
        }
    rich = result.get("rich_results") or {}
    verdict = str(rich.get("verdict") or "UNKNOWN")
    types = rich.get("schema_types") or []
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
        "source": "gsc",
        "message": message,
        "verdict": verdict,
    }
    if types:
        row["schema_types"] = types
    if rich.get("issues"):
        row["issues"] = rich["issues"]
    return row
