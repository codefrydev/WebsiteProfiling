"""Integrations routers — /api/integrations/google/* and /api/integrations/bing/*."""
from __future__ import annotations

import json
import os
import sys
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from psycopg import Connection

from ..deps import get_db

router = APIRouter(prefix="/integrations", tags=["integrations"])

DbDep = Annotated[Connection, Depends(get_db)]

_MIGRATED_DETAIL = (
    "This endpoint moved to IntegrationsService. "
    "Configure INTEGRATIONS_ROUTES on the BFF to proxy /api/integrations/* and /api/properties/*/google."
)


def _raise_if_migrated() -> None:
    if os.environ.get("DEPRECATE_PYTHON_INTEGRATIONS", "").strip() == "1":
        raise HTTPException(status_code=410, detail=_MIGRATED_DETAIL)


# ── Helpers ────────────────────────────────────────────────────────────────────

def _google_public_status(conn: Connection) -> dict[str, Any]:
    """Build a public status dict from google_app_settings."""
    from website_profiling.db.google_app_store import read_google_app_settings

    cfg = read_google_app_settings(conn)
    has_client_id = bool(cfg.get("client_id"))
    has_client_secret = bool(cfg.get("client_secret"))
    has_service_account = bool(cfg.get("service_account_json"))
    sa = cfg.get("service_account_json") or {}
    return {
        "hasClientId": has_client_id,
        "hasClientSecret": has_client_secret,
        "hasOAuthApp": has_client_id and has_client_secret,
        "hasServiceAccount": has_service_account,
        "serviceAccountEmail": sa.get("client_email") if has_service_account else None,
        "dateRangeDays": cfg.get("default_date_range_days", 28),
        "hasDeveloperToken": bool(cfg.get("developer_token")),
        "hasLoginCustomerId": bool(cfg.get("login_customer_id")),
    }


# ── GET /api/integrations/google/credentials ──────────────────────────────────

@router.get("/google/credentials")
def get_google_credentials(conn: DbDep) -> dict[str, Any]:
    """Full app-level Google OAuth settings (server-side / local admin only)."""
    from website_profiling.db.google_app_store import read_google_app_settings

    cfg = read_google_app_settings(conn)
    sa = cfg.get("service_account_json")
    return {
        "clientId": str(cfg.get("client_id") or "").strip(),
        "clientSecret": str(cfg.get("client_secret") or "").strip(),
        "serviceAccount": sa if isinstance(sa, dict) else None,
        "dateRangeDays": int(cfg.get("default_date_range_days") or 28),
        "developerToken": str(cfg.get("developer_token") or "").strip(),
        "loginCustomerId": str(cfg.get("login_customer_id") or "").strip(),
    }


# ── GET /api/integrations/google/status ───────────────────────────────────────

@router.get("/google/status")
def google_status(conn: DbDep) -> dict[str, Any]:
    _raise_if_migrated()
    from website_profiling.integrations.google.store import read_last_google_fetched_at

    status = _google_public_status(conn)
    status["lastFetchedAt"] = read_last_google_fetched_at(conn)
    return status


# App-level Google credential writes (OAuth client, service account) → AiService PUT /api/secrets via BFF.

# ── POST /api/integrations/google/disconnect ──────────────────────────────────

@router.post("/google/disconnect")
def google_disconnect(conn: DbDep) -> dict[str, Any]:
    _raise_if_migrated()
    """Global disconnect is deprecated — use per-property disconnect."""
    return {
        "ok": False,
        "error": (
            "Disconnect Google per site: set Site URL, open Integrations, "
            "and use Disconnect on that property."
        ),
        "status": _google_public_status(conn),
    }


# ── GET /api/integrations/google/auth ─────────────────────────────────────────
# OAuth consent + callback (moved server-side from the former Next.js routes; the browser
# reaches these through the BFF). Heavy logic lives in integrations/google/oauth.py.

@router.get("/google/auth")
def google_oauth_start(
    conn: DbDep,
    propertyId: Optional[int] = Query(default=None),
    startUrl: Optional[str] = Query(default=None),
    returnTo: Optional[str] = Query(default=None),
) -> Any:
    _raise_if_migrated()
    from fastapi.responses import RedirectResponse
    from website_profiling.integrations.google.oauth import OAuthError, oauth_start

    try:
        url = oauth_start(conn, propertyId, startUrl, returnTo)
    except OAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return RedirectResponse(url, status_code=302)


@router.get("/google/callback")
def google_oauth_callback(
    conn: DbDep,
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
) -> Any:
    _raise_if_migrated()
    from fastapi.responses import RedirectResponse
    from website_profiling.integrations.google.oauth import oauth_callback

    url = oauth_callback(conn, code, state, error)
    return RedirectResponse(url, status_code=302)


# ── GET /api/integrations/google/properties ───────────────────────────────────

@router.get("/google/properties")
def google_properties_deprecated(
    property_id: Optional[int] = Query(None, alias="propertyId"),
) -> dict[str, Any]:
    _raise_if_migrated()
    """Deprecated — use /api/properties/{id}/google/properties."""
    if not property_id:
        raise HTTPException(
            status_code=400,
            detail="propertyId query parameter is required. Use /api/properties/{id}/google/properties instead.",
        )
    raise HTTPException(
        status_code=301,
        detail=f"Use /api/properties/{property_id}/google/properties",
    )


# ── POST /api/integrations/google/test ────────────────────────────────────────

@router.post("/google/test")
def google_test() -> dict[str, Any]:
    _raise_if_migrated()
    """Run `python -m src google --test` and return stdout log."""
    import subprocess
    import sys

    try:
        result = subprocess.run(
            [sys.executable, "-m", "src", "google", "--test"],
            capture_output=True,
            text=True,
            timeout=30,
        )
        log = (result.stdout + result.stderr)[-28_000:]
        return {"ok": result.returncode == 0, "log": log, "exitCode": result.returncode}
    except subprocess.TimeoutExpired:
        return {"ok": False, "log": "", "error": "Test timed out after 30s"}
    except Exception as exc:
        return {"ok": False, "log": "", "error": str(exc)}


# ── GET /api/integrations/google/page-data ────────────────────────────────────

@router.get("/google/page-data")
def google_page_data(
    conn: DbDep,
    url: str = Query(...),
    googleSnapshotId: Optional[int] = Query(None),
    propertyId: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
) -> dict[str, Any]:
    _raise_if_migrated()
    from website_profiling.db.property_store import resolve_property_id_for_page
    from website_profiling.integrations.google.page_lookup import slice_from_google_row
    from website_profiling.integrations.google.store import read_google_snapshot_row

    if not url:
        raise HTTPException(status_code=400, detail="url parameter required")

    property_id = resolve_property_id_for_page(conn, url, propertyId, domain)

    _empty = {
        "source": "snapshot",
        "snapshotId": None,
        "gsc": None,
        "ga4": None,
        "coverage": {"inCrawl": False, "inGsc": False, "inGa4": False},
        "siteBenchmarks": {"gsc": None, "ga4": None},
        "dateRange": {},
        "fetchedAt": None,
    }

    if property_id is None:
        return _empty

    snap = read_google_snapshot_row(
        conn,
        property_id,
        snapshot_id=googleSnapshotId,
    )
    if not snap:
        return _empty

    slice_data = slice_from_google_row(snap["data"], url)
    return {
        **slice_data,
        "snapshotId": snap["id"],
        "fetchedAt": snap["fetchedAt"] or slice_data.get("fetchedAt"),
    }


# ── GET /api/integrations/google/page-data/history ────────────────────────────

@router.get("/google/page-data/history")
def google_page_data_history(
    conn: DbDep,
    url: str = Query(...),
    propertyId: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
) -> dict[str, Any]:
    _raise_if_migrated()
    from website_profiling.db.property_store import resolve_property_id_for_page
    from website_profiling.integrations.google.page_lookup import (
        slice_from_google_row,
        summary_from_slice,
    )
    from website_profiling.integrations.google.store import list_google_snapshot_rows

    if not url:
        raise HTTPException(status_code=400, detail="url parameter required")

    property_id = resolve_property_id_for_page(conn, url, propertyId, domain)
    if property_id is None:
        return {"url": url, "history": []}

    history: list[dict[str, Any]] = []
    for snap in list_google_snapshot_rows(conn, property_id, limit=10):
        slice_data = slice_from_google_row(snap["data"], url)
        if not slice_data.get("gsc") and not slice_data.get("ga4"):
            continue
        summary = summary_from_slice(slice_data.get("gsc"), slice_data.get("ga4"))
        history.append({
            "id": snap["id"],
            "fetchedAt": snap["fetchedAt"],
            "type": "snapshot",
            "gsc": summary.get("gsc"),
            "ga4": summary.get("ga4"),
        })

    return {"url": url, "history": history}


# ── POST /api/integrations/google/page-live ───────────────────────────────────

@router.post("/google/page-live")
def google_page_live(
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    _raise_if_migrated()
    url = str(body.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="url is required")

    try:
        result = subprocess.run(
            [sys.executable, "-m", "src", "page-live", "--url", url],
            capture_output=True,
            text=True,
            timeout=45,
        )
        combined = result.stdout + result.stderr
        log = combined[-28_000:]
        lines = [ln for ln in result.stdout.strip().splitlines() if ln]
        last = lines[-1] if lines else "{}"
        try:
            data = json.loads(last)
        except Exception:
            data = {}

        if result.returncode != 0 and not data.get("ok") and not data.get("gsc") and not data.get("ga4"):
            raise HTTPException(
                status_code=500,
                detail=data.get("error") or "Live fetch failed",
            )
        import datetime
        return {"ok": True, "fetchedAt": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"), **data}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Live fetch timed out after 45s")


# ── GET /api/integrations/google/keywords/by-page ─────────────────────────────

@router.get("/google/keywords/by-page")
def google_keywords_by_page(
    conn: DbDep,
    url: str = Query(..., alias="url"),
    propertyId: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
) -> dict[str, Any]:
    _raise_if_migrated()
    from website_profiling.db.property_store import resolve_property_id_for_page
    from website_profiling.integrations.google.keyword_store import read_latest_keyword_data

    page_url = url.strip()
    if not page_url:
        raise HTTPException(status_code=400, detail="url parameter is required")

    property_id = resolve_property_id_for_page(conn, page_url, propertyId, domain)
    if property_id is None:
        raise HTTPException(status_code=400, detail="propertyId or domain required")

    data = read_latest_keyword_data(conn, property_id) or {}
    all_rows = data.get("rows") or []
    normalized_target = page_url.lower()

    page_keywords = [
        r for r in all_rows
        if _matches_url(r.get("gsc_url") or "", normalized_target)
    ]

    cannib_raw = data.get("cannibalisation") or []
    cannib = [
        c for c in cannib_raw
        if any(
            (p.get("url") or "").lower() == normalized_target
            for p in (c.get("pages") or [])
        )
    ]

    return {
        "url": page_url,
        "propertyId": property_id,
        "keyword_count": len(page_keywords),
        "keywords": page_keywords,
        "cannibalisation": cannib,
        "fetched_at": data.get("fetched_at"),
    }


def _matches_url(candidate: str, target: str) -> bool:
    u = candidate.lower()
    return u == target or u in target or target in u


# ── GET /api/integrations/google/keywords/history ────────────────────────────

@router.get("/google/keywords/history")
def google_keywords_history(
    conn: DbDep,
    keyword: str = Query(...),
    propertyId: Optional[str] = Query(None),
    domain: Optional[str] = Query(None),
    limit: int = Query(30, ge=1, le=90),
) -> dict[str, Any]:
    _raise_if_migrated()
    from website_profiling.db.property_store import resolve_property_id_for_page
    from website_profiling.integrations.google.keyword_store import read_keyword_history

    keyword = keyword.strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword parameter is required")

    property_id = resolve_property_id_for_page(conn, "", propertyId, domain)
    if property_id is None:
        raise HTTPException(status_code=400, detail="propertyId or domain required")

    history = read_keyword_history(conn, keyword, limit, property_id=property_id)
    return {"keyword": keyword, "propertyId": property_id, "history": history}


# ── POST /api/integrations/bing/sync ─────────────────────────────────────────

@router.post("/bing/sync")
def bing_sync(conn: DbDep) -> dict[str, Any]:
    _raise_if_migrated()
    """Fetch Bing Webmaster backlinks summary using config from DB."""
    from website_profiling.db.config_store import read_pipeline_config

    try:
        state, _ = read_pipeline_config(conn)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    api_key = str(state.get("bing_webmaster_api_key") or "").strip()
    site_url = str(state.get("start_url") or "").strip()

    if not api_key or not site_url:
        raise HTTPException(
            status_code=400,
            detail="Set bing_webmaster_api_key and start_url in pipeline settings.",
        )

    try:
        from website_profiling.integrations.bing.webmaster import fetch_bing_backlinks_summary

        result = fetch_bing_backlinks_summary(api_key, site_url)
        return result  # type: ignore[return-value]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── GET /api/integrations/google/page-compare ────────────────────────────────

@router.get("/google/page-compare")
def google_page_compare(
    conn: DbDep,
    url: str = Query(...),
    currentType: str = Query("snapshot"),
    currentId: int = Query(...),
    baselineType: str = Query("snapshot"),
    baselineId: int = Query(...),
) -> dict[str, Any]:
    _raise_if_migrated()
    """Compare two page Google data snapshots."""
    from website_profiling.integrations.google.page_snapshot_store import read_page_snapshot_compare

    current = read_page_snapshot_compare(conn, currentId)
    baseline = read_page_snapshot_compare(conn, baselineId)
    if current is None:
        raise HTTPException(status_code=404, detail="Current snapshot not found")
    if baseline is None:
        raise HTTPException(status_code=404, detail="Baseline snapshot not found")
    return {"url": url, "current": current, "baseline": baseline}


# ── GET /api/integrations/google/page-live/history ────────────────────────────

@router.get("/google/page-live/history")
def google_page_live_history(
    conn: DbDep,
    url: str = Query(...),
    limit: int = Query(15, ge=1, le=50),
) -> dict[str, Any]:
    _raise_if_migrated()
    """Return history of page Google snapshots for a URL."""
    from website_profiling.integrations.google.page_snapshot_store import list_page_snapshot_api_history

    try:
        history = list_page_snapshot_api_history(conn, url, limit=limit)
        return {"url": url, "history": history}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── POST /api/integrations/google/keywords/history/batch ─────────────────────

@router.post("/google/keywords/history/batch")
def google_keywords_history_batch(
    conn: DbDep,
    body: dict[str, Any],
) -> dict[str, Any]:
    _raise_if_migrated()
    """Batch keyword history: { keywords: str[], limit?: int, propertyId?: int, domain?: str }"""
    from website_profiling.db.property_store import get_property_id_by_domain
    from website_profiling.integrations.google.keyword_store import read_keyword_history_batch

    keywords_raw = body.get("keywords") or []
    if not isinstance(keywords_raw, list):
        raise HTTPException(status_code=400, detail="keywords must be a list")
    keywords = [str(k).strip() for k in keywords_raw[:100] if k]
    limit = max(1, min(int(body.get("limit") or 30), 90))
    property_id = None
    if body.get("propertyId"):
        try:
            property_id = int(body["propertyId"])
        except (TypeError, ValueError):
            pass
    elif body.get("domain"):
        property_id = get_property_id_by_domain(conn, str(body["domain"]))

    if property_id is None:
        raise HTTPException(status_code=400, detail="propertyId or domain required")

    results = read_keyword_history_batch(
        conn,
        keywords,
        property_id=property_id,
        limit=limit,
    )
    return {"keywords": results, "propertyId": property_id}


# ── GET/POST /api/integrations/google/keywords/expand ────────────────────────

@router.post("/google/keywords/expand")
def google_keywords_expand(
    conn: DbDep,
    body: dict[str, Any],
) -> dict[str, Any]:
    """Expand keyword ideas from Google Keyword Planner or suggest API."""
    keyword = str(body.get("keyword") or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword required")
    try:
        from website_profiling.tools.keyword_suggestions import expand_keyword
        result = expand_keyword(keyword, body.get("propertyId"), conn)
        return result if isinstance(result, dict) else {"keywords": result}
    except ImportError:
        raise HTTPException(status_code=501, detail="Keyword expansion unavailable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


# ── POST /api/integrations/google/keywords/planner ────────────────────────────

@router.post("/google/keywords/planner")
def google_keywords_planner(
    conn: DbDep,
    body: dict[str, Any],
) -> dict[str, Any]:
    """Fetch keyword planner data from Google Ads API."""
    keywords_raw = body.get("keywords") or []
    if not isinstance(keywords_raw, list):
        raise HTTPException(status_code=400, detail="keywords must be a list")
    try:
        from website_profiling.integrations.google.keyword_planner import fetch_keyword_ideas
        result = fetch_keyword_ideas(conn, keywords_raw)
        return result if isinstance(result, dict) else {"ideas": result}
    except ImportError:
        raise HTTPException(status_code=501, detail="Google Keyword Planner unavailable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
