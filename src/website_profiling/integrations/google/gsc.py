"""
Google Search Console API v3 -- searchanalytics.query
"""
from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlparse


INSTALL_HINT = (
    "pip install google-api-python-client"
)


def _build_service(creds):
    try:
        from googleapiclient.discovery import build
    except ImportError as e:
        raise ImportError(f"Install Google API client: {INSTALL_HINT}\n({e})") from e
    return build("searchconsole", "v1", credentials=creds, cache_discovery=False)


def _call_with_retry(fn, max_retries: int = 3, base_delay: float = 2.0):
    """Call fn(); retry on 429/503 with exponential backoff."""
    try:
        from googleapiclient.errors import HttpError
    except ImportError as e:
        raise ImportError(f"Install Google API client: {INSTALL_HINT}\n({e})") from e

    for attempt in range(max_retries):
        try:
            return fn()
        except HttpError as e:
            status = e.resp.status if hasattr(e, "resp") else 0
            if status in (429, 503) and attempt < max_retries - 1:
                delay = base_delay * (2 ** attempt)
                print(f"  [GSC] HTTP {status} -- retrying in {delay:.0f}s...", flush=True)
                time.sleep(delay)
                continue
            raise
    raise RuntimeError("Max retries exceeded")


def fetch_gsc_data(
    creds,
    site_url: str,
    date_range_days: int = 28,
    row_limit: int = 1000,
    max_rows: int = 25000,
) -> dict[str, Any]:
    """
    Fetch search analytics from GSC with pagination (up to max_rows).
    Returns structured dict with summary, top_queries, top_pages, by_page, daily.
    """
    service = _build_service(creds)
    end = date.today() - timedelta(days=3)  # GSC has ~3 day delay
    start = end - timedelta(days=date_range_days - 1)

    def _query(dimensions: list[str], page_limit: int = row_limit) -> list[dict]:
        """Paginate GSC results until empty or max_rows reached."""
        all_rows: list[dict] = []
        start_row = 0
        while len(all_rows) < max_rows:
            body = {
                "startDate": start.isoformat(),
                "endDate": end.isoformat(),
                "dimensions": dimensions,
                "rowLimit": min(page_limit, max_rows - len(all_rows)),
                "startRow": start_row,
            }
            resp = _call_with_retry(
                lambda: service.searchanalytics()
                .query(siteUrl=site_url, body=body)
                .execute()
            )
            page = resp.get("rows", [])
            if not page:
                break
            all_rows.extend(page)
            if len(page) < page_limit:
                break
            start_row += len(page)
        return all_rows

    # Queries (dimension: query) — primary source for keyword enrichment
    query_rows = _query(["query"], page_limit=row_limit)
    # Pages (dimension: page)
    page_rows = _query(["page"], page_limit=row_limit)
    # Page + query — required for cannibalisation (same query, multiple URLs)
    page_query_cap = min(max_rows, 15000)
    page_query_rows = _query(["page", "query"], page_limit=row_limit)
    if len(page_query_rows) > page_query_cap:
        page_query_rows = page_query_rows[:page_query_cap]
    # Daily time-series — ~date_range_days rows, small page_limit is fine
    daily_rows = _query(["date"], page_limit=100)

    def _to_query_record(row: dict) -> dict:
        keys = row.get("keys", [])
        return {
            "query": keys[0] if keys else "",
            "clicks": int(row.get("clicks", 0)),
            "impressions": int(row.get("impressions", 0)),
            "ctr": round(float(row.get("ctr", 0)) * 100, 2),
            "position": round(float(row.get("position", 0)), 1),
        }

    def _to_page_record(row: dict) -> dict:
        keys = row.get("keys", [])
        return {
            "page": keys[0] if keys else "",
            "clicks": int(row.get("clicks", 0)),
            "impressions": int(row.get("impressions", 0)),
            "ctr": round(float(row.get("ctr", 0)) * 100, 2),
            "position": round(float(row.get("position", 0)), 1),
        }

    def _to_daily_record(row: dict) -> dict:
        keys = row.get("keys", [])
        return {
            "date": keys[0] if keys else "",
            "clicks": int(row.get("clicks", 0)),
            "impressions": int(row.get("impressions", 0)),
            "ctr": round(float(row.get("ctr", 0)) * 100, 2),
            "position": round(float(row.get("position", 0)), 1),
        }

    all_queries = [_to_query_record(r) for r in query_rows]
    all_pages = [_to_page_record(r) for r in page_rows]
    daily = sorted(
        [_to_daily_record(r) for r in daily_rows if (r.get("keys") or [""])[0]],
        key=lambda r: r["date"],
    )

    # Summary totals
    total_clicks = sum(r["clicks"] for r in all_pages)
    total_impressions = sum(r["impressions"] for r in all_pages)
    avg_ctr = (
        round(total_clicks / total_impressions * 100, 2) if total_impressions else 0.0
    )
    avg_position = (
        round(sum(r["position"] for r in all_pages) / len(all_pages), 1)
        if all_pages
        else 0.0
    )

    # by_page with nested queries for keyword cannibalisation + page drill-down
    by_page: dict[str, Any] = {r["page"]: {**r, "queries": []} for r in all_pages if r["page"]}
    for raw in page_query_rows:
        keys = raw.get("keys") or []
        if len(keys) < 2:
            continue
        page_url, query_text = keys[0], keys[1]
        if not page_url or not query_text:
            continue
        qrec = {
            "query": query_text,
            "clicks": int(raw.get("clicks", 0)),
            "impressions": int(raw.get("impressions", 0)),
            "ctr": round(float(raw.get("ctr", 0)) * 100, 2),
            "position": round(float(raw.get("position", 0)), 1),
        }
        if page_url not in by_page:
            by_page[page_url] = {
                "page": page_url,
                "clicks": 0,
                "impressions": 0,
                "ctr": 0.0,
                "position": 0.0,
                "queries": [],
            }
        by_page[page_url]["queries"].append(qrec)

    return {
        "site_url": site_url,
        "summary": {
            "clicks": total_clicks,
            "impressions": total_impressions,
            "ctr": avg_ctr,
            "position": avg_position,
        },
        "top_queries": all_queries[:100],
        "top_pages": all_pages[:100],
        "by_page": by_page,
        "daily": daily,
        "date_start": start.isoformat(),
        "date_end": end.isoformat(),
    }


def list_gsc_sites(creds) -> list[str]:
    """Return list of verified site URLs the user has access to."""
    service = _build_service(creds)
    resp = _call_with_retry(lambda: service.sites().list().execute())
    sites = resp.get("siteEntry", [])
    return [s["siteUrl"] for s in sites if s.get("siteUrl")]


def _url_prefix_key(site_url: str) -> str | None:
    """Normalize URL-prefix properties for comparison (GSC requires exact siteUrl)."""
    site_url = site_url.strip()
    if site_url.startswith("sc-domain:"):
        return site_url.lower()
    if not site_url.startswith(("http://", "https://")):
        return None
    parsed = urlparse(site_url)
    host = parsed.netloc.lower().lstrip("www.")
    path = parsed.path.rstrip("/") or ""
    return f"{parsed.scheme.lower()}://{host}{path}/"


def _domain_from_site_url(site_url: str) -> str | None:
    site_url = site_url.strip()
    if site_url.startswith("sc-domain:"):
        return site_url.split(":", 1)[1].lower().lstrip("www.")
    if site_url.startswith(("http://", "https://")):
        return urlparse(site_url).netloc.lower().lstrip("www.")
    return None


def resolve_gsc_site_url(configured: str, sites: list[str]) -> tuple[str | None, str | None]:
    """
    Match a configured GSC site URL to an exact entry from sites.list().
    GSC API calls require the precise siteUrl string (including trailing slash).
    Returns (resolved_url, error_message).
    """
    configured = (configured or "").strip()
    if not configured:
        return None, "No GSC site URL configured."

    if configured in sites:
        return configured, None

    configured_key = _url_prefix_key(configured)
    if configured_key:
        for site in sites:
            if _url_prefix_key(site) == configured_key:
                return site, None

    configured_domain = _domain_from_site_url(configured)
    if configured_domain:
        for site in sites:
            if _domain_from_site_url(site) == configured_domain:
                return site, None

    site_list = ", ".join(sites) if sites else "(none)"
    hint = ""
    if configured.startswith(("http://", "https://")) and not configured.endswith("/"):
        trailing = configured + "/"
        if trailing in sites:
            hint = f" Use the exact URL '{trailing}' from Search Console."
    elif configured.endswith("/"):
        no_trailing = configured.rstrip("/")
        if no_trailing in sites:
            hint = f" Use the exact URL '{no_trailing}' from Search Console."
    return (
        None,
        f"Configured GSC site '{configured}' does not match any accessible property.{hint} "
        f"Accessible sites: [{site_list}]. "
        "Open Integrations, click 'Load from account', pick the site from the dropdown, and Save settings.",
    )


def describe_gsc_site_mismatch(configured: str, sites: list[str]) -> str:
    """Human-readable explanation when configured GSC URL does not match accessible sites."""
    resolved, error = resolve_gsc_site_url(configured, sites)
    if resolved:
        if resolved == configured:
            return f"GSC site '{configured}' is accessible."
        return (
            f"GSC site '{configured}' matches accessible property '{resolved}' "
            f"(Search Console requires the exact property URL)."
        )
    return error or f"GSC site '{configured}' is not accessible."


def probe_gsc_site(creds, site_url: str) -> tuple[bool, str]:
    """
    Verify GSC Search Analytics access with a minimal query.
    Returns (ok, message).
    """
    site_url = (site_url or "").strip()
    if not site_url:
        return False, "No GSC site URL configured."

    try:
        service = _build_service(creds)
        end = date.today() - timedelta(days=3)
        start = end - timedelta(days=6)
        body = {
            "startDate": start.isoformat(),
            "endDate": end.isoformat(),
            "dimensions": ["query"],
            "rowLimit": 1,
        }
        resp = _call_with_retry(
            lambda: service.searchanalytics()
            .query(siteUrl=site_url, body=body)
            .execute()
        )
        rows = resp.get("rows", [])
        if not rows:
            return True, (
                f"Site '{site_url}' is accessible, but returned 0 search rows for the last 7 days "
                "(new property, low traffic, or indexing still in progress)."
            )
        row = rows[0]
        query = (row.get("keys") or [""])[0]
        impressions = int(row.get("impressions", 0))
        return True, (
            f"Site '{site_url}' is accessible "
            f"(sample query: '{query}', {impressions} impression(s) in probe window)."
        )
    except Exception as e:
        msg = str(e)
        if "403" in msg or "Forbidden" in msg:
            return False, (
                f"Site '{site_url}' is not accessible with the connected Google account. "
                "Confirm the account has access in Search Console, or pick the site from "
                "Integrations > Load from account."
            )
        if "404" in msg or "not found" in msg.lower():
            return False, (
                f"Site '{site_url}' was not found. Search Console requires the exact property URL "
                "(URL-prefix properties usually end with a trailing slash)."
            )
        return False, f"GSC probe for '{site_url}' failed: {msg}"
