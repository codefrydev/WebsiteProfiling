"""Ollama local + cloud model catalog (mirrors web/src/server/ollamaModels.ts)."""
from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from typing import Any

OLLAMA_CLOUD_CATALOG_URL = "https://ollama.com/api/tags"

PRO_CLOUD_MODEL_PATTERNS = [
    re.compile(r"671b", re.I),
    re.compile(r"480b", re.I),
    re.compile(r":1t(?:-cloud|:cloud)?$", re.I),
    re.compile(r"v4-pro", re.I),
    re.compile(r"nemotron-3-ultra", re.I),
    re.compile(r"nemotron-3-super", re.I),
    re.compile(r"mistral-large", re.I),
    re.compile(r"397b", re.I),
    re.compile(r"cogito-2\.1:671b", re.I),
    re.compile(r"deepseek-v4-pro", re.I),
    re.compile(r"qwen3-coder:480b", re.I),
    re.compile(r"gpt-oss:120b", re.I),
]


def is_cloud_model_ref(name: str) -> bool:
    return name.endswith("-cloud") or name.endswith(":cloud")


def to_cloud_model_ref(name: str) -> str:
    trimmed = name.strip()
    if not trimmed:
        return trimmed
    if trimmed.endswith("-cloud") or trimmed.endswith(":cloud"):
        return trimmed
    return f"{trimmed}-cloud" if ":" in trimmed else f"{trimmed}:cloud"


def resolve_billing_tier(name: str, source: str) -> dict[str, Any]:
    cloud = source == "cloud" or is_cloud_model_ref(name)
    if not cloud:
        return {"billing": "free_local", "requires_subscription": False}
    if any(p.search(name) for p in PRO_CLOUD_MODEL_PATTERNS):
        return {"billing": "cloud_pro", "requires_subscription": True}
    return {"billing": "cloud_free", "requires_subscription": True}


def _with_billing(entry: dict[str, Any]) -> dict[str, Any]:
    tier = resolve_billing_tier(str(entry.get("name") or ""), str(entry.get("source") or "local"))
    return {**entry, **tier}


def _normalize_local_model(raw: dict[str, Any]) -> dict[str, Any] | None:
    name = str(raw.get("name") or "").strip()
    if not name:
        return None
    cloud = bool(raw.get("remote_host")) or is_cloud_model_ref(name)
    details = raw.get("details") if isinstance(raw.get("details"), dict) else {}
    return _with_billing({
        "name": name,
        "source": "cloud" if cloud else "local",
        "installed": True,
        "capabilities": raw.get("capabilities") if isinstance(raw.get("capabilities"), list) else None,
        "context_length": details.get("context_length"),
    })


def _normalize_catalog_model(raw: dict[str, Any]) -> dict[str, Any] | None:
    base = str(raw.get("name") or "").strip()
    if not base:
        return None
    return _with_billing({
        "name": to_cloud_model_ref(base),
        "source": "cloud",
        "installed": False,
    })


def _model_key(name: str) -> str:
    return name.lower()


def merge_ollama_models(
    local: list[dict[str, Any]],
    cloud_catalog: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_key: dict[str, dict[str, Any]] = {}
    for m in cloud_catalog:
        by_key[_model_key(str(m.get("name") or ""))] = m
    for m in local:
        key = _model_key(str(m.get("name") or ""))
        existing = by_key.get(key)
        merged = {
            **(existing or {}),
            **m,
            "installed": True,
            "capabilities": m.get("capabilities") or (existing or {}).get("capabilities"),
            "context_length": m.get("context_length") or (existing or {}).get("context_length"),
        }
        by_key[key] = _with_billing(merged)

    def sort_key(m: dict[str, Any]) -> tuple:
        return (
            0 if m.get("installed") else 1,
            0 if m.get("source") == "local" else 1,
            str(m.get("name") or ""),
        )

    return sorted(by_key.values(), key=sort_key)


def _fetch_json(url: str, *, timeout: float = 8.0) -> dict[str, Any] | None:
    try:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError):
        return None


def fetch_ollama_models(base_url: str) -> dict[str, Any]:
    normalized_base = (base_url or "http://127.0.0.1:11434").rstrip("/") or "http://127.0.0.1:11434"

    local_data = _fetch_json(f"{normalized_base}/api/tags", timeout=8.0)
    cloud_data = _fetch_json(OLLAMA_CLOUD_CATALOG_URL, timeout=12.0)

    local_ok = local_data is not None
    cloud_catalog_ok = cloud_data is not None

    local_models = [
        m for raw in (local_data or {}).get("models") or []
        if isinstance(raw, dict)
        for m in [_normalize_local_model(raw)]
        if m is not None
    ]
    cloud_models = [
        m for raw in (cloud_data or {}).get("models") or []
        if isinstance(raw, dict)
        for m in [_normalize_catalog_model(raw)]
        if m is not None
    ]
    models = merge_ollama_models(local_models, cloud_models)

    if not local_ok and not cloud_catalog_ok:
        return {
            "ok": False,
            "baseUrl": normalized_base,
            "models": [],
            "cloudCatalogOk": False,
            "localOk": False,
            "error": "Cannot reach Ollama or the cloud model catalog.",
        }

    return {
        "ok": local_ok or cloud_catalog_ok,
        "baseUrl": normalized_base,
        "models": models,
        "cloudCatalogOk": cloud_catalog_ok,
        "localOk": local_ok,
    }


def model_is_configured(models: list[dict[str, Any]], configured_model: str) -> bool:
    target = configured_model.strip()
    if not target:
        return len(models) > 0
    key = _model_key(target)
    return any(_model_key(str(m.get("name") or "")) == key for m in models)


def models_support_tools(models: list[dict[str, Any]]) -> bool:
    return any("tools" in (m.get("capabilities") or []) for m in models)
