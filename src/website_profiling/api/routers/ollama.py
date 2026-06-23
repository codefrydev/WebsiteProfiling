"""Ollama LLM runtime status — /api/ollama/*."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends
from psycopg import Connection

from ..deps import get_db

router = APIRouter(tags=["ollama"])

DbDep = Annotated[Connection, Depends(get_db)]

DEFAULT_BASE = "http://127.0.0.1:11434"


@router.get("/ollama/status")
def ollama_status(conn: DbDep) -> dict[str, Any]:
    from website_profiling.db.config_store import read_llm_config
    from website_profiling.llm.ollama_catalog import (
        fetch_ollama_models,
        model_is_configured,
        models_support_tools,
    )

    cfg = read_llm_config(conn)
    base_url = str(cfg.get("llm_base_url") or DEFAULT_BASE).rstrip("/")
    configured_model = str(cfg.get("llm_model") or "").strip()

    result = fetch_ollama_models(base_url)
    if not result.get("ok"):
        return {
            "ok": False,
            "baseUrl": result.get("baseUrl", base_url),
            "configuredModel": configured_model,
            "error": result.get("error") or "Cannot reach Ollama. Is it running?",
            "models": [],
            "cloudCatalogOk": False,
            "localOk": False,
        }

    models = result.get("models") or []
    model_installed = model_is_configured(models, configured_model)
    configured_entry = next(
        (m for m in models if str(m.get("name") or "").lower() == configured_model.lower()),
        None,
    )

    return {
        "ok": True,
        "baseUrl": result.get("baseUrl", base_url),
        "configuredModel": configured_model,
        "modelInstalled": model_installed,
        "supportsTools": (
            "tools" in (configured_entry.get("capabilities") or [])
            if configured_entry
            else models_support_tools(models)
        ),
        "cloudCatalogOk": result.get("cloudCatalogOk", False),
        "localOk": result.get("localOk", False),
        "catalogSource": "live",
        "cloudModelCount": sum(1 for m in models if m.get("source") == "cloud"),
        "models": models,
    }
