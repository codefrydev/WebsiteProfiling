"""Issues routers — /api/issues/* and /api/ai/*."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Body, HTTPException

router = APIRouter(tags=["issues"])


# ── POST /api/issues/fix-suggestion ──────────────────────────────────────────

@router.post("/issues/fix-suggestion")
def issues_fix_suggestion(
    body: dict[str, Any] = Body(default={}),
) -> Any:
    message = str(body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message required")

    payload = {
        "source": "issue",
        "message": message,
        "url": body.get("url"),
        "priority": body.get("priority"),
        "category": body.get("category"),
        "recommendation": body.get("recommendation"),
        "type": body.get("type"),
        "refresh": body.get("refresh"),
    }

    try:
        from website_profiling.llm.fix_suggestions import generate_fix_suggestion  # type: ignore[import]

        return generate_fix_suggestion(payload, refresh=bool(payload.get("refresh")))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Fix suggestion failed: {exc}")


# ── POST /api/issues/action-plan ──────────────────────────────────────────────

@router.post("/issues/action-plan")
def issues_action_plan(
    body: dict[str, Any] = Body(default={}),
) -> Any:
    domain = str(body.get("domain") or "").strip()
    if not domain:
        raise HTTPException(status_code=400, detail="domain required")
    if not isinstance(body.get("issues"), list) or len(body["issues"]) == 0:
        raise HTTPException(status_code=400, detail="issues required")

    payload = {
        "domain": domain,
        "issues": body["issues"],
        "refresh": body.get("refresh"),
    }

    try:
        from website_profiling.llm.issues_action_plan import generate_issues_action_plan  # type: ignore[import]

        return generate_issues_action_plan(payload, refresh=bool(payload.get("refresh")))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Action plan failed: {exc}")


# ── POST /api/ai/fix-suggestion ──────────────────────────────────────────────

@router.post("/ai/fix-suggestion")
def ai_fix_suggestion(
    body: dict[str, Any] = Body(default={}),
) -> Any:
    message = str(body.get("message") or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="message required")

    payload = {
        "source": body.get("source") or "issue",
        "message": message,
        "url": body.get("url"),
        "refresh": body.get("refresh"),
        "context": body.get("context"),
        "priority": body.get("priority"),
        "category": body.get("category"),
        "recommendation": body.get("recommendation"),
        "type": body.get("type"),
    }

    try:
        from website_profiling.llm.fix_suggestions import generate_fix_suggestion  # type: ignore[import]

        return generate_fix_suggestion(payload, refresh=bool(payload.get("refresh")))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Fix suggestion failed: {exc}")
