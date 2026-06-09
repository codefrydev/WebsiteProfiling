"""Unified on-demand LLM fix suggestions across audit surfaces."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from ..llm_config import llm_is_enabled
from .base import get_llm_client, parse_json_response
from .enrich import _read_cache, _write_cache
from .prompts import FIX_SUGGESTION_PROMPTS, PROMPT_VERSION

VALID_SOURCES = frozenset(FIX_SUGGESTION_PROMPTS.keys())
DEFAULT_FIX = {"fix": "Review the issue on the affected URL and apply standard remediation.", "effort": "medium"}


def _fix_suggestion_enabled(cfg: dict[str, str]) -> bool:
    v = str(cfg.get("llm_enable_issue_fixes", "true")).lower()
    return v in ("true", "1", "yes")


def _normalize_source(raw: Any) -> str:
    source = str(raw or "issue").strip().lower()
    return source if source in VALID_SOURCES else "issue"


def _cache_key(model: str, source: str, payload: dict[str, Any]) -> str:
    body = json.dumps(payload, sort_keys=True, default=str)
    digest = hashlib.sha256(f"fix_suggestion:{PROMPT_VERSION}:{model}:{source}:{body}".encode()).hexdigest()
    return digest


def _build_user_payload(payload: dict[str, Any]) -> dict[str, Any]:
    source = _normalize_source(payload.get("source"))
    out: dict[str, Any] = {
        "source": source,
        "message": str(payload.get("message") or "").strip(),
    }
    if payload.get("url"):
        out["url"] = payload.get("url")
    context = payload.get("context")
    if isinstance(context, dict) and context:
        out["context"] = context
    # Legacy issue-fix fields folded into context for source=issue
    if source == "issue":
        legacy: dict[str, Any] = {}
        for key in ("priority", "category", "type", "finding_type", "recommendation", "existing_recommendation"):
            if payload.get(key) is not None:
                legacy[key] = payload.get(key)
        if legacy:
            out.setdefault("context", {}).update(legacy)
    return out


def generate_fix_suggestion(
    payload: dict[str, Any],
    *,
    cfg: dict[str, str] | None = None,
    refresh: bool = False,
) -> dict[str, Any]:
    from ..llm_config import load_llm_config_from_db

    cfg = cfg or load_llm_config_from_db()
    if not llm_is_enabled(cfg):
        return {"ok": False, "error": "AI insights are disabled."}
    if not _fix_suggestion_enabled(cfg):
        return {"ok": False, "error": "Issue fix suggestions are disabled in AI task settings."}

    user_payload = _build_user_payload(payload)
    message = user_payload.get("message") or ""
    if not message:
        return {"ok": False, "error": "message required."}

    source = str(user_payload["source"])
    model = (cfg.get("llm_model") or cfg.get("llm_provider") or "unknown").strip()
    cache_key = _cache_key(model, source, user_payload)

    if not refresh:
        cached = _read_cache(cache_key)
        if cached:
            return {"ok": True, "cached": True, "fix": cached, "provenance": "AI insights"}

    system = FIX_SUGGESTION_PROMPTS[source]
    try:
        client = get_llm_client(cfg)
        user = json.dumps(user_payload, indent=2, default=str)[:8000]
        raw = client.complete_json(system, user)
        fix = raw if isinstance(raw, dict) and raw else parse_json_response(str(raw))
        if not fix or not str(fix.get("fix") or "").strip():
            fix = dict(DEFAULT_FIX)
        _write_cache(cache_key, fix)
        return {"ok": True, "cached": False, "fix": fix, "provenance": "AI insights"}
    except Exception as e:
        return {"ok": False, "error": str(e)}
