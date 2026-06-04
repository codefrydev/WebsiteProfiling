"""
On-demand GSC + GA4 fetch for a single page URL (filtered API queries).
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from ...config import get_int
from .auth import build_credentials, read_secrets
from .gsc import _build_service as gsc_build_service, _call_with_retry as gsc_call_with_retry, resolve_gsc_site_url, list_gsc_sites
from .normalize import normalize_url, url_to_path
from .page_lookup import _public_ga4_page, _public_gsc_page
from .page_snapshot_store import package_live_payload, write_page_snapshot


def fetch_gsc_page_live(
    creds,
    site_url: str,
    page_url: str,
    date_range_days: int = 28,
) -> tuple[dict[str, Any] | None, list[str]]:
    """Return page-level GSC metrics + top queries for one URL."""
    errors: list[str] = []
    try:
        service = gsc_build_service(creds)
    except Exception as e:
        return None, [str(e)]

    end = date.today() - timedelta(days=3)
    start = end - timedelta(days=max(1, date_range_days) - 1)

    def _query(dimensions: list[str], row_limit: int = 50) -> list[dict]:
        body: dict[str, Any] = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": dimensions,
            "dimensionFilterGroups": [
                {
                    "filters": [
                        {
                            "dimension": "page",
                            "operator": "equals",
                            "expression": page_url,
                        }
                    ]
                }
            ],
            "rowLimit": row_limit,
        }
        resp = gsc_call_with_retry(
            lambda: service.searchanalytics()
            .query(siteUrl=site_url, body=body)
            .execute()
        )
        return resp.get("rows", []) or []

    page_rows = _query(["page"], row_limit=5)
    query_rows = _query(["page", "query"], row_limit=100)

    if not page_rows and not query_rows:
        alt = page_url.rstrip("/") + "/" if not page_url.endswith("/") else page_url.rstrip("/")
        if alt != page_url:
            page_url = alt
            page_rows = _query(["page"], row_limit=5)
            query_rows = _query(["page", "query"], row_limit=100)

    if not page_rows and not query_rows:
        return None, [f"No GSC data for page in date range."]

    clicks = impressions = 0
    ctr_sum = pos_sum = 0.0
    n = 0
    for row in page_rows:
        clicks += int(row.get("clicks", 0))
        impressions += int(row.get("impressions", 0))
        ctr_sum += float(row.get("ctr", 0))
        pos_sum += float(row.get("position", 0))
        n += 1

    queries: list[dict[str, Any]] = []
    for row in query_rows:
        keys = row.get("keys") or []
        if len(keys) < 2:
            continue
        queries.append(
            {
                "query": keys[1],
                "clicks": int(row.get("clicks", 0)),
                "impressions": int(row.get("impressions", 0)),
                "ctr": round(float(row.get("ctr", 0)) * 100, 2),
                "position": round(float(row.get("position", 0)), 1),
            }
        )
    queries.sort(key=lambda q: q.get("impressions", 0), reverse=True)

    page_data = {
        "page": page_url,
        "clicks": clicks,
        "impressions": impressions,
        "ctr": round((clicks / impressions * 100) if impressions else 0.0, 2),
        "position": round(pos_sum / n, 1) if n else 0.0,
        "queries": queries[:25],
    }
    return page_data, errors


def fetch_ga4_page_live(
    creds,
    property_id: str,
    page_url: str,
    start_url: str = "",
    date_range_days: int = 28,
) -> tuple[dict[str, Any] | None, list[str]]:
    errors: list[str] = []
    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import (
            DateRange,
            Dimension,
            Filter,
            FilterExpression,
            Metric,
            RunReportRequest,
        )
    except ImportError as e:
        return None, [str(e)]

    path = url_to_path(page_url)
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=max(1, date_range_days) - 1)

    client = BetaAnalyticsDataClient(credentials=creds)
    filter_expr = FilterExpression(
        filter=Filter(
            field_name="pagePath",
            string_filter=Filter.StringFilter(value=path, match_type=Filter.StringFilter.MatchType.EXACT),
        )
    )

    req = RunReportRequest(
        property=f"properties/{property_id}",
        date_ranges=[DateRange(start_date=start.isoformat(), end_date=end.isoformat())],
        dimensions=[Dimension(name="pagePath")],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="screenPageViews"),
            Metric(name="engagementRate"),
            Metric(name="averageSessionDuration"),
        ],
        dimension_filter=filter_expr,
        limit=5,
    )

    try:
        response = client.run_report(req)
    except Exception as e:
        return None, [str(e)]

    if not response.rows:
        return None, [f"No GA4 data for path {path} in date range."]

    row = response.rows[0]
    vals = [v.value for v in row.metric_values]
    from .normalize import path_to_url as _ptu

    page_data = {
        "path": path,
        "full_url": _ptu(path, start_url) if start_url else page_url,
        "sessions": int(float(vals[0])) if vals else 0,
        "activeUsers": int(float(vals[1])) if len(vals) > 1 else 0,
        "screenPageViews": int(float(vals[2])) if len(vals) > 2 else 0,
        "engagementRate": round(float(vals[3]), 4) if len(vals) > 3 else 0.0,
        "avgSessionDuration": round(float(vals[4]), 1) if len(vals) > 4 else 0.0,
    }
    return page_data, errors


def fetch_page_live(
    page_url: str,
    config: dict[str, Any] | None = None,
    *,
    persist: bool = True,
    credentials_path: str | None = None,
) -> dict[str, Any]:
    """Fetch live GSC/GA4 for one URL; optionally persist to page_google_snapshots."""
    cfg = config or {}
    secrets = read_secrets(credentials_path)
    date_range_days = int(secrets.get("dateRangeDays") or get_int(cfg, "google_date_range_days", 28) or 28)
    gsc_site = (secrets.get("gscSiteUrl") or "").strip()
    ga4_property = (secrets.get("ga4PropertyId") or "").strip()
    start_url = (cfg.get("start_url") or "").strip()

    errors: list[str] = []
    creds = build_credentials(credentials_path)

    gsc_data = None
    ga4_data = None

    if gsc_site:
        try:
            sites = list_gsc_sites(creds)
            resolved, site_err = resolve_gsc_site_url(gsc_site, sites)
            if not resolved:
                errors.append(f"GSC: {site_err}")
            else:
                gsc_data, gsc_errs = fetch_gsc_page_live(creds, resolved, page_url, date_range_days)
                errors.extend(gsc_errs)
        except Exception as e:
            errors.append(f"GSC: {e}")
    else:
        errors.append("GSC: no site URL configured.")

    if ga4_property:
        try:
            ga4_data, ga4_errs = fetch_ga4_page_live(
                creds, ga4_property, page_url, start_url, date_range_days
            )
            errors.extend(ga4_errs)
        except Exception as e:
            errors.append(f"GA4: {e}")
    else:
        errors.append("GA4: no property ID configured.")

    end_gsc = date.today() - timedelta(days=3)
    start_gsc = end_gsc - timedelta(days=max(1, date_range_days) - 1)
    date_range = {
        "start": start_gsc.isoformat(),
        "end": end_gsc.isoformat(),
    }

    payload = package_live_payload(page_url, gsc_data, ga4_data, date_range=date_range, errors=errors)
    payload["gsc"] = _public_gsc_page(gsc_data)
    payload["ga4"] = _public_ga4_page(ga4_data)

    snapshot_id = None
    if persist:
        from ...db import db_session

        with db_session() as conn:
            snapshot_id = write_page_snapshot(conn, page_url, payload)

    return {
        "ok": bool(gsc_data or ga4_data),
        "snapshotId": snapshot_id,
        "source": "live",
        "pageUrl": page_url,
        "gsc": payload.get("gsc"),
        "ga4": payload.get("ga4"),
        "dateRange": date_range,
        "fetchedAt": None,
        "errors": [e for e in errors if e],
    }
