"""Properties router — /api/properties/*"""
from __future__ import annotations

import os
from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from psycopg import Connection

from ..deps import get_db

router = APIRouter(tags=["properties"])

DbDep = Annotated[Connection, Depends(get_db)]

_GOOGLE_MIGRATED_DETAIL = (
    "Property Google endpoints moved to IntegrationsService. "
    "Configure INTEGRATIONS_ROUTES on the BFF."
)


def _raise_if_google_migrated() -> None:
    if os.environ.get("DEPRECATE_PYTHON_INTEGRATIONS", "").strip() == "1":
        raise HTTPException(status_code=410, detail=_GOOGLE_MIGRATED_DETAIL)


class PropertyUpsertBody(BaseModel):
    name: Optional[str] = None
    canonical_domain: Optional[str] = None
    site_url: Optional[str] = None


class PropertyEnsureBody(BaseModel):
    startUrl: Optional[str] = None


class OpsSettingsBody(BaseModel):
    scheduleCron: Optional[str] = None
    alertWebhookUrl: Optional[str] = None
    alertEmail: Optional[str] = None


class PresetBody(BaseModel):
    preset: Optional[str] = None


class GoogleCredentialsPatch(BaseModel):
    refreshToken: Optional[str] = None
    authMode: Optional[str] = None
    gscSiteUrl: Optional[str] = None
    ga4PropertyId: Optional[str] = None
    dateRangeDays: Optional[int] = None
    connectedEmail: Optional[str] = None


class GoogleCredentialsPostBody(BaseModel):
    gscSiteUrl: Optional[str] = None
    ga4PropertyId: Optional[str] = None
    dateRangeDays: Optional[int] = None
    refreshToken: Optional[str] = None


@router.get("/properties")
def list_properties(conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.property_store import list_properties_public
    return {"properties": list_properties_public(conn)}


@router.post("/properties", status_code=201)
def create_property(body: PropertyUpsertBody, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.property_store import upsert_property_by_domain

    name = (body.name or "").strip()
    domain = (body.canonical_domain or "").strip().lower()
    if not name or not domain:
        raise HTTPException(status_code=400, detail="name and canonical_domain required")

    site_url = (body.site_url or "").strip() or None
    prop_id = upsert_property_by_domain(conn, name, domain, site_url)
    return {"id": prop_id, "name": name, "canonical_domain": domain}


@router.post("/properties/ensure", status_code=200)
def ensure_property(body: PropertyEnsureBody, conn: DbDep) -> dict[str, Any]:
    """Create a property row when the URL is complete (OAuth / explicit actions only)."""
    from website_profiling.db.property_store import (
        canonical_domain_from_start_url,
        ensure_property_from_start_url,
        get_property_by_domain,
    )

    start_url = (body.startUrl or "").strip()
    if not start_url:
        raise HTTPException(status_code=400, detail="startUrl required")

    prop_id = ensure_property_from_start_url(conn, start_url)
    if prop_id is None:
        raise HTTPException(status_code=400, detail="Valid site URL with a domain is required")

    domain = canonical_domain_from_start_url(start_url)
    prop = get_property_by_domain(conn, domain) if domain else None
    return {
        "id": prop_id,
        "canonical_domain": domain,
        "default_crawl_preset": prop.get("default_crawl_preset") if prop else None,
    }


@router.get("/properties/resolve")
def resolve_property(
    conn: DbDep,
    startUrl: str = Query(..., description="Start URL to resolve a property from"),
) -> dict[str, Any]:
    from website_profiling.db.property_store import (
        canonical_domain_from_start_url,
        get_property_by_domain,
        lookup_property_id_from_start_url,
    )

    start_url = startUrl.strip()
    if not start_url:
        raise HTTPException(status_code=400, detail="startUrl required")

    prop_id = lookup_property_id_from_start_url(conn, start_url)
    domain = canonical_domain_from_start_url(start_url)
    prop = get_property_by_domain(conn, domain) if domain else None
    return {
        "id": prop_id,
        "canonical_domain": domain,
        "default_crawl_preset": prop.get("default_crawl_preset") if prop else None,
    }


@router.get("/properties/{property_id}")
def get_property(property_id: int, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.property_store import get_property_by_id

    prop = get_property_by_id(conn, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.delete("/properties/{property_id}")
def delete_property_route(property_id: int, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.property_store import delete_property

    if not delete_property(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    return {"ok": True}


@router.get("/properties/{property_id}/ops")
def get_property_ops_route(property_id: int, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.property_store import get_property_ops

    ops = get_property_ops(conn, property_id)
    if not ops:
        raise HTTPException(status_code=404, detail="Property not found")
    return ops


@router.put("/properties/{property_id}/ops")
def update_property_ops_route(property_id: int, body: OpsSettingsBody, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.property_store import get_property_by_id, update_property_ops

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")

    update_property_ops(
        conn,
        property_id,
        schedule_cron=body.scheduleCron,
        alert_webhook_url=body.alertWebhookUrl,
        alert_email=body.alertEmail,
    )
    return {"ok": True}


@router.get("/properties/{property_id}/preset")
def get_property_preset(property_id: int, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.property_store import get_property_by_id

    prop = get_property_by_id(conn, property_id)
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return {"default_crawl_preset": prop.get("default_crawl_preset")}


@router.put("/properties/{property_id}/preset")
def update_property_preset(property_id: int, body: PresetBody, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.property_store import get_property_by_id, update_property_crawl_preset

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")

    preset = (body.preset or "").strip() or None
    update_property_crawl_preset(conn, property_id, preset)
    return {"ok": True, "default_crawl_preset": preset}


@router.post("/properties/{property_id}/authorize")
def authorize_property_crawl_route(property_id: int, conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.property_store import authorize_property_crawl, get_property_by_id

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    authorize_property_crawl(conn, property_id)
    return {"ok": True}


@router.get("/properties/{property_id}/google/status")
def property_google_status(property_id: int, conn: DbDep) -> dict[str, Any]:
    _raise_if_google_migrated()
    from website_profiling.db.property_store import get_property_google_status

    status = get_property_google_status(conn, property_id)
    if not status:
        raise HTTPException(status_code=404, detail="Property not found")
    return status


@router.post("/properties/{property_id}/google/test")
def property_google_test(property_id: int, conn: DbDep) -> dict[str, Any]:
    _raise_if_google_migrated()
    from website_profiling.db.property_store import get_property_by_id

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    try:
        from website_profiling.integrations.google.test import test_google_connection
        result = test_google_connection(conn, property_id)
        return result if isinstance(result, dict) else {"ok": True, "log": str(result)}
    except ImportError:
        raise HTTPException(status_code=501, detail="Google test unavailable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/properties/{property_id}/google/properties")
def property_google_properties(property_id: int, conn: DbDep) -> dict[str, Any]:
    _raise_if_google_migrated()
    from website_profiling.db.property_store import get_property_by_id

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    try:
        from website_profiling.integrations.google.discover import list_google_properties
        result = list_google_properties(conn, property_id)
        return result if isinstance(result, dict) else {"properties": result}
    except ImportError:
        raise HTTPException(status_code=501, detail="Google properties discovery unavailable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/properties/{property_id}/google/links/status")
def property_google_links_status(property_id: int, conn: DbDep) -> dict[str, Any]:
    _raise_if_google_migrated()
    from website_profiling.db.property_store import get_property_by_id

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    try:
        from website_profiling.integrations.google.gsc_links_store import read_gsc_links_status
        return read_gsc_links_status(conn, property_id)
    except Exception:
        return {"hasData": False}


@router.post("/properties/{property_id}/google/links/import")
def property_google_links_import(property_id: int, conn: DbDep) -> dict[str, Any]:
    _raise_if_google_migrated()
    from website_profiling.db.property_store import get_property_by_id

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    try:
        from website_profiling.integrations.google.links import import_gsc_links
        result = import_gsc_links(conn, property_id)
        return result if isinstance(result, dict) else {"ok": True, "imported": result}
    except ImportError:
        raise HTTPException(status_code=501, detail="GSC links import unavailable")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


def _apply_google_credentials_from_patch(
    conn: Connection,
    property_id: int,
    body: GoogleCredentialsPatch,
) -> None:
    from website_profiling.db.property_store import apply_property_google_credentials_patch

    fields_set: set[str] = set()
    if body.gscSiteUrl is not None:
        fields_set.add("gsc_site_url")
    if body.ga4PropertyId is not None:
        fields_set.add("ga4_property_id")
    if body.dateRangeDays is not None:
        fields_set.add("date_range_days")
    if body.authMode is not None:
        fields_set.add("auth_mode")
    if body.connectedEmail is not None:
        fields_set.add("connected_email")
    if body.refreshToken is not None:
        fields_set.add("refresh_token")

    try:
        apply_property_google_credentials_patch(
            conn,
            property_id,
            refresh_token=body.refreshToken,
            auth_mode=body.authMode,
            gsc_site_url=body.gscSiteUrl,
            ga4_property_id=body.ga4PropertyId,
            date_range_days=body.dateRangeDays,
            connected_email=body.connectedEmail,
            fields_set=frozenset(fields_set) if fields_set else None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/properties/{property_id}/google/credentials")
def patch_property_google_credentials(
    property_id: int, body: GoogleCredentialsPatch, conn: DbDep
) -> dict[str, Any]:
    _raise_if_google_migrated()
    from website_profiling.db.property_store import get_property_by_id

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    _apply_google_credentials_from_patch(conn, property_id, body)
    return {"ok": True}


@router.post("/properties/{property_id}/google/credentials")
def post_property_google_credentials(
    property_id: int, body: GoogleCredentialsPostBody, conn: DbDep
) -> dict[str, Any]:
    _raise_if_google_migrated()
    from website_profiling.db.property_store import get_property_by_id, get_property_google_public_status

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")

    patch = GoogleCredentialsPatch()
    fields_set = body.model_fields_set
    if "gscSiteUrl" in fields_set:
        patch.gscSiteUrl = body.gscSiteUrl
    if "ga4PropertyId" in fields_set:
        patch.ga4PropertyId = body.ga4PropertyId
    if "dateRangeDays" in fields_set and body.dateRangeDays is not None:
        patch.dateRangeDays = body.dateRangeDays
    if isinstance(body.refreshToken, str) and body.refreshToken.strip():
        patch.refreshToken = body.refreshToken.strip()
        patch.authMode = "oauth"

    _apply_google_credentials_from_patch(conn, property_id, patch)
    return {"ok": True, "status": get_property_google_public_status(conn, property_id)}


@router.post("/properties/{property_id}/google/disconnect")
def post_property_google_disconnect(property_id: int, conn: DbDep) -> dict[str, Any]:
    _raise_if_google_migrated()
    from website_profiling.db.property_store import disconnect_property_google, get_property_by_id

    if not get_property_by_id(conn, property_id):
        raise HTTPException(status_code=404, detail="Property not found")
    disconnect_property_google(conn, property_id)
    return {"ok": True}
