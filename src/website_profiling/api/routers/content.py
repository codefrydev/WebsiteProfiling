"""Content routers — /api/content/* and /api/backlinks/* and /api/content-drafts/*."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from psycopg import Connection

from ..deps import get_db
from website_profiling.db import content_draft_store
from website_profiling.integrations.google.gsc_links_store import list_backlinks_velocity

router = APIRouter(tags=["content"])

DbDep = Annotated[Connection, Depends(get_db)]

_VALID_WIZARD_STEPS = {"intents", "content_types", "tones", "titles", "outline", "draft", "research"}


# ── GET /api/backlinks/velocity ──────────────────────────────────────────────

@router.get("/backlinks/velocity")
def backlinks_velocity(
    conn: DbDep,
    propertyId: int = Query(...),
) -> dict[str, Any]:
    if not propertyId:
        raise HTTPException(status_code=400, detail="propertyId required")
    return {"snapshots": list_backlinks_velocity(conn, propertyId)}


# ── POST /api/backlinks/competitor-import ────────────────────────────────────

@router.post("/backlinks/competitor-import")
def backlinks_competitor_import(
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    competitor = str(body.get("competitor") or "").strip()
    csv_text = str(body.get("csvText") or "")
    our_domains = body.get("ourDomains") or []

    if not competitor or not csv_text.strip():
        raise HTTPException(status_code=400, detail="competitor and csvText required")

    try:
        from website_profiling.integrations.google.competitor_links import (  # type: ignore[import]
            parse_referring_domains_from_csv,
            build_competitor_domain_gap,
        )

        refs = parse_referring_domains_from_csv(csv_text)
        gap = build_competitor_domain_gap(set(our_domains), competitor, refs)
        return {"gap": gap}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Competitor backlink import failed: {exc}")


# ── POST /api/backlinks/third-party-import ───────────────────────────────────

@router.post("/backlinks/third-party-import")
def backlinks_third_party_import(
    conn: DbDep,
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    property_id = int(body.get("propertyId") or 0)
    provider = str(body.get("provider") or "moz").strip().lower()
    csv_text = str(body.get("csvText") or "")
    our_domains = body.get("ourDomains") or []

    if not property_id or not csv_text.strip():
        raise HTTPException(status_code=400, detail="propertyId and csvText required")
    if provider not in ("moz", "majestic"):
        raise HTTPException(status_code=400, detail="provider must be moz or majestic")

    try:
        from website_profiling.integrations.links.third_party_csv import (  # type: ignore[import]
            build_third_party_overlay,
        )
        from website_profiling.integrations.google.gsc_links_store import (  # type: ignore[import]
            import_third_party_links_overlay,
        )

        overlay = build_third_party_overlay(provider, csv_text, our_domains)
        result = import_third_party_links_overlay(conn, property_id, overlay)
        return result  # type: ignore[return-value]
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Third-party backlink import failed: {exc}")


# ── POST /api/content/analyze ─────────────────────────────────────────────────

@router.post("/content/analyze")
def content_analyze(
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    keyword = str(body.get("keyword") or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword required")

    property_id_raw = body.get("propertyId")
    property_id = int(property_id_raw) if property_id_raw else None

    try:
        from website_profiling.content_studio.ai_suggest import analyze_content_draft  # type: ignore[import]

        analysis = analyze_content_draft(
            property_id,
            keyword,
            body.get("bodyHtml") or "",
            body.get("titleTag") or "",
            body.get("metaDescription") or "",
            body.get("landingUrl") or None,
            use_ai=bool(body.get("useAi")),
            refresh=bool(body.get("refresh")),
            title=body.get("title") or "",
        )
        return {"analysis": analysis}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Content analyze failed: {exc}")


# ── POST /api/content/score ───────────────────────────────────────────────────

@router.post("/content/score")
def content_score(
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    keyword = str(body.get("keyword") or "").strip()
    if not keyword:
        raise HTTPException(status_code=400, detail="keyword required")

    property_id_raw = body.get("propertyId")
    property_id = int(property_id_raw) if property_id_raw else None

    try:
        from website_profiling.content_studio.score import score_content_draft  # type: ignore[import]

        score = score_content_draft(
            property_id,
            keyword,
            body.get("bodyHtml") or "",
            body.get("titleTag") or "",
            body.get("metaDescription") or "",
            body.get("landingUrl") or None,
        )
        return {"score": score}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Content score failed: {exc}")


# ── POST /api/content/wizard ──────────────────────────────────────────────────

@router.post("/content/wizard")
def content_wizard(
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    step = str(body.get("step") or "").strip()
    if step not in _VALID_WIZARD_STEPS:
        raise HTTPException(status_code=400, detail="Invalid wizard step")

    payload = {
        "keyword": str(body.get("keyword") or "").strip(),
        "locale": str(body.get("locale") or "en-US"),
        "intent": str(body.get("intent") or ""),
        "contentType": str(body.get("contentType") or ""),
        "tone": str(body.get("tone") or ""),
        "title": str(body.get("title") or ""),
        "outline": body.get("outline") if isinstance(body.get("outline"), list) else [],
    }

    try:
        from website_profiling.content_studio.wizard import run_wizard_step  # type: ignore[import]

        result = run_wizard_step(step, payload)
        if isinstance(result, dict) and result.get("ok") is False:
            raise HTTPException(status_code=400, detail=result.get("error") or "Wizard step failed")
        return {"result": result}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Wizard step failed: {exc}")


# ── GET /api/content-drafts ───────────────────────────────────────────────────

@router.get("/content-drafts")
def list_content_drafts_route(
    conn: DbDep,
    propertyId: int = Query(...),
) -> dict[str, Any]:
    if not propertyId:
        raise HTTPException(status_code=400, detail="propertyId required")
    return {"drafts": content_draft_store.list_content_drafts(conn, propertyId)}


# ── POST /api/content-drafts ──────────────────────────────────────────────────

@router.post("/content-drafts")
def create_content_draft_route(
    conn: DbDep,
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    property_id = int(body.get("propertyId") or 0)
    if not property_id:
        raise HTTPException(status_code=400, detail="propertyId required")

    draft_id = content_draft_store.create_content_draft(
        conn,
        property_id,
        title=str(body.get("title") or "Untitled draft"),
        target_keyword=str(body.get("target_keyword") or ""),
        landing_url=str(body.get("landing_url") or "").strip() or None,
        status=str(body.get("status") or "draft"),
        body_html=str(body.get("body_html") or ""),
        title_tag=str(body.get("title_tag") or ""),
        meta_description=str(body.get("meta_description") or ""),
    )
    return {"id": draft_id, "propertyId": property_id}


# ── GET /api/content-drafts/{id} ─────────────────────────────────────────────

@router.get("/content-drafts/{draft_id}")
def get_content_draft_route(conn: DbDep, draft_id: int) -> dict[str, Any]:
    if not draft_id:
        raise HTTPException(status_code=400, detail="invalid draft id")
    draft = content_draft_store.get_content_draft(conn, draft_id)
    if not draft:
        raise HTTPException(status_code=404, detail="draft not found")
    return {"draft": draft}


# ── PATCH /api/content-drafts/{id} ───────────────────────────────────────────

@router.patch("/content-drafts/{draft_id}")
def update_content_draft_route(
    conn: DbDep,
    draft_id: int,
    body: dict[str, Any] = Body(default={}),
) -> dict[str, Any]:
    if not draft_id:
        raise HTTPException(status_code=400, detail="invalid draft id")
    draft = content_draft_store.update_content_draft(conn, draft_id, body)
    if not draft:
        raise HTTPException(status_code=404, detail="draft not found")
    return {"draft": draft}


# ── DELETE /api/content-drafts/{id} ──────────────────────────────────────────

@router.delete("/content-drafts/{draft_id}")
def delete_content_draft_route(conn: DbDep, draft_id: int) -> dict[str, Any]:
    if not draft_id:
        raise HTTPException(status_code=400, detail="invalid draft id")
    if not content_draft_store.delete_content_draft(conn, draft_id):
        raise HTTPException(status_code=404, detail="draft not found")
    return {"ok": True}
