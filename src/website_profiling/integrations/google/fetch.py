"""
Orchestrate GSC + GA4 fetching. Returns a structured google_data dict
suitable for storage in the google_data table and merging into report_payload.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from .auth import build_credentials, resolve_google_targets
from .gsc import fetch_gsc_data, list_gsc_sites, resolve_gsc_site_url
from .ga4 import fetch_ga4_data, list_ga4_properties, probe_ga4_property
from .normalize import compute_url_join


def fetch_google_data(
    date_range_days: int = 28,
    crawl_urls: list[str] | None = None,
    start_url: str = "",
    config: dict[str, Any] | None = None,
    property_id: int | None = None,
) -> dict[str, Any]:
    """
    Fetch GSC and GA4 data. Each API is independent: if one fails, the other's
    results are still returned. Errors are collected in google_data["errors"].

    Returns a dict matching the report payload google schema.
    """
    gsc_site_url, ga4_property_id, resolved_days = resolve_google_targets(
        property_id=property_id
    )
    if not date_range_days:
        date_range_days = resolved_days

    errors: list[str] = []
    gsc_data: dict[str, Any] | None = None
    ga4_data: dict[str, Any] | None = None

    creds = build_credentials(property_id=property_id)

    # Fetch GSC
    if gsc_site_url:
        try:
            sites = list_gsc_sites(creds)
            resolved_site, site_error = resolve_gsc_site_url(gsc_site_url, sites)
            if not resolved_site:
                errors.append(f"GSC: {site_error}")
                print(f"  [Google] GSC error: {site_error}", flush=True)
            else:
                if resolved_site != gsc_site_url:
                    print(
                        f"  [Google] GSC: using '{resolved_site}' "
                        f"(configured as '{gsc_site_url}')",
                        flush=True,
                    )
                print(f"  [Google] Fetching Search Console data for {resolved_site}...", flush=True)
                cfg = config or {}
                gsc_max_rows = int(cfg.get("keyword_gsc_max_rows") or 25000)
                gsc_data = fetch_gsc_data(
                    creds,
                    site_url=resolved_site,
                    date_range_days=date_range_days,
                    max_rows=gsc_max_rows,
                )
                print(
                    f"  [Google] GSC: {gsc_data['summary']['clicks']} clicks, "
                    f"{gsc_data['summary']['impressions']} impressions",
                    flush=True,
                )
                if gsc_data["summary"]["impressions"] == 0:
                    print(
                        "  [Google] GSC: no impressions returned for this date range "
                        "(property may be new, unverified, or have no search data yet).",
                        flush=True,
                    )
        except RuntimeError as e:
            msg = str(e)
            errors.append(f"GSC: {msg}")
            print(f"  [Google] GSC error: {msg}", flush=True)
        except Exception as e:
            msg = str(e)
            errors.append(f"GSC: {msg}")
            print(f"  [Google] GSC error: {msg}", flush=True)
    else:
        errors.append("GSC: no site URL configured (set in Integrations > Website in Search Console)")

    # Fetch GA4
    if ga4_property_id:
        try:
            print(f"  [Google] Fetching GA4 data for property {ga4_property_id}...", flush=True)
            ga4_data = fetch_ga4_data(
                creds,
                property_id=ga4_property_id,
                date_range_days=date_range_days,
                start_url=start_url,
            )
            print(
                f"  [Google] GA4: {ga4_data['summary']['sessions']} sessions, "
                f"{ga4_data['summary']['activeUsers']} users",
                flush=True,
            )
        except RuntimeError as e:
            msg = str(e)
            errors.append(f"GA4: {msg}")
            print(f"  [Google] GA4 error: {msg}", flush=True)
        except Exception as e:
            msg = str(e)
            errors.append(f"GA4: {msg}")
            print(f"  [Google] GA4 error: {msg}", flush=True)
    else:
        errors.append("GA4: no property ID configured (set in Integrations > Analytics property)")

    # Compute date range (use from whichever API succeeded, else compute)
    date_start = (gsc_data or ga4_data or {}).get("date_start", "")
    date_end = (gsc_data or ga4_data or {}).get("date_end", "")

    # URL join stats
    url_join: dict[str, Any] = {
        "matched": 0, "crawl_only": 0, "gsc_only": 0, "ga4_only": 0,
        "lists": {"crawl_only": [], "gsc_only": [], "ga4_only": []},
        "lists_total": {"crawl_only": 0, "gsc_only": 0, "ga4_only": 0},
        "list_limit": 200,
    }
    if crawl_urls and (gsc_data or ga4_data):
        cfg = config or {}
        gsc_pages = list((gsc_data or {}).get("by_page", {}).keys())
        ga4_paths = list((ga4_data or {}).get("by_path", {}).keys())
        url_join = compute_url_join(
            crawl_urls, gsc_pages, ga4_paths, start_url,
            gsc_by_page=(gsc_data or {}).get("by_page"),
            ga4_by_path=(ga4_data or {}).get("by_path"),
            list_limit=int(cfg.get("google_url_gap_list_limit") or 200),
        )

    # Strip by_page / by_path from the payload-facing portion (too large)
    # They stay in the full dict which is what gets stored in the DB
    gsc_payload: dict[str, Any] | None = None
    if gsc_data:
        gsc_payload = {
            "site_url": gsc_data["site_url"],
            "summary": gsc_data["summary"],
            "top_queries": gsc_data["top_queries"],
            "top_pages": gsc_data["top_pages"],
            "daily": gsc_data.get("daily", []),
        }

    ga4_payload: dict[str, Any] | None = None
    if ga4_data:
        ga4_payload = {
            "property_id": ga4_data["property_id"],
            "summary": ga4_data["summary"],
            "top_pages": ga4_data["top_pages"],
            "daily": ga4_data.get("daily", []),
            "by_channel": ga4_data.get("by_channel", []),
            "by_device": ga4_data.get("by_device", []),
        }

    return {
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "date_range": {"start": date_start, "end": date_end},
        "gsc": gsc_payload,
        "gsc_full": gsc_data,      # full data incl. by_page -- stored in google_data only
        "ga4": ga4_payload,
        "ga4_full": ga4_data,      # full data incl. by_path -- stored in google_data only
        "url_join": url_join,
        "errors": errors,
    }


def list_properties(property_id: int | None = None) -> dict[str, Any]:
    """List accessible GSC sites and GA4 properties."""
    creds = build_credentials(property_id=property_id)
    gsc_sites = list_gsc_sites(creds)
    ga4_properties, ga4_list_error = list_ga4_properties(creds)
    result: dict[str, Any] = {"gscSites": gsc_sites, "ga4Properties": ga4_properties}
    if ga4_list_error:
        result["ga4ListError"] = ga4_list_error
    return result
