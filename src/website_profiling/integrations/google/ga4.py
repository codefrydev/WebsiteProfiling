"""
Google Analytics Data API (GA4) -- runReport
"""
from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Any

INSTALL_HINT = "pip install google-analytics-data"


def _call_with_retry(fn, max_retries: int = 3, base_delay: float = 2.0):
    """Retry on transient errors. RESOURCE_EXHAUSTED (daily quota) is NOT retried."""
    try:
        from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable, TooManyRequests
    except ImportError as e:
        raise ImportError(f"Install Google Analytics Data: {INSTALL_HINT}\n({e})") from e

    for attempt in range(max_retries):
        try:
            return fn()
        except ResourceExhausted:
            raise RuntimeError(
                "GA4 quota exceeded -- try again tomorrow. "
                "(Google Analytics Data API daily token quota reached.)"
            )
        except (ServiceUnavailable, TooManyRequests) as e:
            if attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                print(f"  [GA4] {type(e).__name__} -- retrying in {delay:.0f}s...", flush=True)
                time.sleep(delay)
                continue
            raise
    raise RuntimeError("Max retries exceeded")


def fetch_ga4_data(
    creds,
    property_id: str,
    date_range_days: int = 28,
    start_url: str = "",
) -> dict[str, Any]:
    """
    Fetch page-level metrics from GA4 including daily trend, channel, and device breakdowns.
    Returns structured dict with summary, top_pages (with full_url), by_path,
    daily, by_channel, by_device.
    """
    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import (
            DateRange,
            Dimension,
            Metric,
            OrderBy,
            RunReportRequest,
        )
    except ImportError as e:
        raise ImportError(f"Install Google Analytics Data: {INSTALL_HINT}\n({e})") from e

    from .normalize import path_to_url

    client = BetaAnalyticsDataClient(credentials=creds)

    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=date_range_days - 1)
    date_range = [DateRange(start_date=start.isoformat(), end_date=end.isoformat())]
    core_metrics = [
        Metric(name="sessions"),
        Metric(name="activeUsers"),
        Metric(name="screenPageViews"),
    ]

    def _run_report(dimensions, metrics, limit, order_bys):
        req = RunReportRequest(
            property=f"properties/{property_id}",
            date_ranges=date_range,
            dimensions=[Dimension(name=d) for d in dimensions],
            metrics=metrics,
            limit=limit,
            order_bys=order_bys,
        )
        return _call_with_retry(lambda: client.run_report(req))

    # --- Pages report (existing) ---
    pages_response = _run_report(
        dimensions=["pagePath"],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="screenPageViews"),
            Metric(name="engagementRate"),
            Metric(name="averageSessionDuration"),
        ],
        limit=1000,
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)],
    )

    rows = []
    for row in pages_response.rows:
        path = row.dimension_values[0].value if row.dimension_values else ""
        vals = [v.value for v in row.metric_values]
        full_url = path_to_url(path, start_url) if start_url and path else ""
        rows.append({
            "path": path,
            "full_url": full_url,
            "sessions": int(float(vals[0])) if vals else 0,
            "activeUsers": int(float(vals[1])) if len(vals) > 1 else 0,
            "screenPageViews": int(float(vals[2])) if len(vals) > 2 else 0,
            "engagementRate": round(float(vals[3]), 4) if len(vals) > 3 else 0.0,
            "avgSessionDuration": round(float(vals[4]), 1) if len(vals) > 4 else 0.0,
        })

    total_sessions = sum(r["sessions"] for r in rows)
    total_users = sum(r["activeUsers"] for r in rows)
    total_pageviews = sum(r["screenPageViews"] for r in rows)

    by_path = {r["path"]: r for r in rows if r["path"]}

    # --- Daily time-series ---
    daily_response = _run_report(
        dimensions=["date"],
        metrics=core_metrics,
        limit=400,
        order_bys=[OrderBy(dimension=OrderBy.DimensionOrderBy(dimension_name="date"), desc=False)],
    )
    daily = []
    for row in daily_response.rows:
        d = row.dimension_values[0].value if row.dimension_values else ""
        vals = [v.value for v in row.metric_values]
        if not d:
            continue
        daily.append({
            "date": d,
            "sessions": int(float(vals[0])) if vals else 0,
            "activeUsers": int(float(vals[1])) if len(vals) > 1 else 0,
            "screenPageViews": int(float(vals[2])) if len(vals) > 2 else 0,
        })
    daily.sort(key=lambda r: r["date"])

    # --- Channel breakdown ---
    channel_response = _run_report(
        dimensions=["sessionDefaultChannelGroup"],
        metrics=core_metrics,
        limit=20,
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)],
    )
    by_channel = []
    for row in channel_response.rows:
        ch = row.dimension_values[0].value if row.dimension_values else ""
        vals = [v.value for v in row.metric_values]
        by_channel.append({
            "channel": ch,
            "sessions": int(float(vals[0])) if vals else 0,
            "activeUsers": int(float(vals[1])) if len(vals) > 1 else 0,
            "screenPageViews": int(float(vals[2])) if len(vals) > 2 else 0,
        })

    # --- Device breakdown ---
    device_response = _run_report(
        dimensions=["deviceCategory"],
        metrics=core_metrics,
        limit=10,
        order_bys=[OrderBy(metric=OrderBy.MetricOrderBy(metric_name="sessions"), desc=True)],
    )
    by_device = []
    for row in device_response.rows:
        dev = row.dimension_values[0].value if row.dimension_values else ""
        vals = [v.value for v in row.metric_values]
        by_device.append({
            "device": dev,
            "sessions": int(float(vals[0])) if vals else 0,
            "activeUsers": int(float(vals[1])) if len(vals) > 1 else 0,
            "screenPageViews": int(float(vals[2])) if len(vals) > 2 else 0,
        })

    return {
        "property_id": property_id,
        "summary": {
            "sessions": total_sessions,
            "activeUsers": total_users,
            "screenPageViews": total_pageviews,
        },
        "top_pages": rows[:100],
        "by_path": by_path,
        "daily": daily,
        "by_channel": by_channel,
        "by_device": by_device,
        "date_start": start.isoformat(),
        "date_end": end.isoformat(),
    }


def list_ga4_properties(creds) -> tuple[list[dict], str | None]:
    """
    Return GA4 properties the OAuth user / service account can access.
    Returns (properties, error_message). error_message is set when listing failed.
    """
    try:
        from google.analytics.admin_v1alpha import AnalyticsAdminServiceClient
    except ImportError:
        return [], (
            "Could not list GA4 properties: google-analytics-admin is not installed "
            "(pip install google-analytics-admin). You can still enter a property ID manually "
            "and use 'Test connection' to verify access."
        )

    try:
        client = AnalyticsAdminServiceClient(credentials=creds)
        results = []
        for account_summary in client.list_account_summaries():
            for prop in account_summary.property_summaries:
                prop_id = prop.property.split("/")[-1] if prop.property else ""
                results.append({
                    "id": prop_id,
                    "displayName": prop.display_name or prop_id,
                    "accountName": account_summary.display_name or "",
                })
        if not results:
            return [], (
                "No GA4 properties returned for this Google account. "
                "Confirm the account has Analytics access, or enter the numeric property ID "
                "from GA4 Admin > Property Settings and run Test connection."
            )
        return results, None
    except Exception as e:
        return [], f"Could not list GA4 properties: {e}"


def probe_ga4_property(creds, property_id: str) -> tuple[bool, str]:
    """
    Verify GA4 Data API access for a property with a minimal report request.
    Returns (ok, message).
    """
    property_id = (property_id or "").strip()
    if not property_id:
        return False, "No GA4 property ID configured."

    try:
        from google.analytics.data_v1beta import BetaAnalyticsDataClient
        from google.analytics.data_v1beta.types import (
            DateRange,
            Metric,
            RunReportRequest,
        )
    except ImportError as e:
        return False, f"GA4 Data API client not installed: {e}"

    try:
        client = BetaAnalyticsDataClient(credentials=creds)
        request = RunReportRequest(
            property=f"properties/{property_id}",
            date_ranges=[DateRange(start_date="7daysAgo", end_date="yesterday")],
            metrics=[Metric(name="sessions")],
            limit=1,
        )
        response = _call_with_retry(lambda: client.run_report(request))
        row_count = len(response.rows)
        if row_count == 0:
            return True, (
                f"GA4 property {property_id} is accessible, but returned 0 rows for the last 7 days. "
                "The property may be new, have no traffic yet, or use a different date range."
            )
        sessions = 0
        if response.rows[0].metric_values:
            sessions = int(float(response.rows[0].metric_values[0].value or 0))
        return True, (
            f"GA4 property {property_id} is accessible "
            f"(sample: {row_count} row(s), {sessions} session(s) in probe window)."
        )
    except Exception as e:
        msg = str(e)
        if "PERMISSION_DENIED" in msg or "403" in msg:
            return False, (
                f"GA4 property {property_id} is not accessible with the connected Google account. "
                "Open GA4 Admin and confirm this account has at least Viewer access to the property."
            )
        if "NOT_FOUND" in msg or "404" in msg:
            return False, (
                f"GA4 property {property_id} was not found. "
                "Use the numeric Property ID from GA4 Admin > Property Settings (not the G-XXXXXXX Measurement ID)."
            )
        return False, f"GA4 property {property_id} probe failed: {msg}"
