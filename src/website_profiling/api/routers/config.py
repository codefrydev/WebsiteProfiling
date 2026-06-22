"""Config routes: pipeline-config, llm-config, secrets, app-settings."""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection
from pydantic import BaseModel

from ..deps import get_db

router = APIRouter(tags=["config"])

_MASK = "*"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _mask_secrets(data: dict[str, Any]) -> dict[str, Any]:
    """Return a copy of *data* with secret-ish values replaced by ``'*'``."""
    masked: dict[str, Any] = {}
    for k, v in data.items():
        val_str = str(v) if v is not None else ""
        if val_str and (_is_secret_key(k)):
            masked[k] = _MASK
        else:
            masked[k] = v
    return masked


def _is_secret_key(key: str) -> bool:
    key_lower = key.lower()
    return (
        key_lower.endswith("_secret")
        or key_lower.endswith("_api_key")
        or key_lower.endswith("_key")
        or "api_key" in key_lower
        or "secret" in key_lower
        or "password" in key_lower
        or "token" in key_lower
    )


def _read_llm_config_full(conn: Connection) -> list[dict[str, Any]]:
    from website_profiling.db.config_store import read_llm_config_full
    return read_llm_config_full(conn)


def _read_app_setting(conn: Connection, key: str) -> Optional[str]:
    from website_profiling.db.config_store import read_app_setting
    return read_app_setting(conn, key)


def _write_app_setting(conn: Connection, key: str, value: str) -> None:
    from website_profiling.db.config_store import write_app_setting
    write_app_setting(conn, key, value)


# ---------------------------------------------------------------------------
# pipeline-config
# ---------------------------------------------------------------------------


@router.get("/pipeline-config")
def get_pipeline_config(conn: Annotated[Connection, Depends(get_db)]) -> dict[str, Any]:
    from website_profiling.db.config_store import read_pipeline_config

    state, unknown_keys = read_pipeline_config(conn)
    return {"state": state, "unknownKeys": unknown_keys, "source": "db"}


class PipelineConfigBody(BaseModel):
    state: dict[str, Any]
    unknownKeys: Optional[list[dict[str, str]]] = None


@router.put("/pipeline-config")
def put_pipeline_config(
    body: PipelineConfigBody,
    conn: Annotated[Connection, Depends(get_db)],
) -> dict[str, Any]:
    from website_profiling.db.config_store import write_pipeline_config

    coerced: dict[str, str] = {str(k): str(v) for k, v in body.state.items()}
    unknown_keys: list[dict[str, str]] = body.unknownKeys or []
    write_pipeline_config(conn, coerced, unknown_keys)
    conn.commit()
    return {"ok": True, "source": "db"}


# ---------------------------------------------------------------------------
# llm-config
# ---------------------------------------------------------------------------


@router.get("/llm-config")
def get_llm_config(conn: Annotated[Connection, Depends(get_db)]) -> dict[str, Any]:
    rows = _read_llm_config_full(conn)
    state: dict[str, Any] = {}
    for row in rows:
        k = str(row["key"])
        v = str(row["value"])
        is_secret = bool(row.get("is_secret"))
        state[k] = _MASK if (is_secret and v) else v
    return {"state": state, "source": "db"}


class LlmConfigBody(BaseModel):
    state: dict[str, Any]


@router.put("/llm-config")
def put_llm_config(
    body: LlmConfigBody,
    conn: Annotated[Connection, Depends(get_db)],
) -> dict[str, Any]:
    from website_profiling.db.config_store import write_llm_config

    # Preserve existing secret values when client sends "*" (masked sentinel)
    existing_rows = _read_llm_config_full(conn)
    existing: dict[str, str] = {str(r["key"]): str(r["value"]) for r in existing_rows}
    existing_secrets: set[str] = {str(r["key"]) for r in existing_rows if r.get("is_secret")}

    entries: dict[str, str] = {}
    secret_keys: set[str] = set()

    for k, v in body.state.items():
        val = str(v) if v is not None else ""
        is_masked_sentinel = val.strip() in (_MASK, "••••") or (
            val.strip().startswith("*") and len(val.strip()) <= 4
        )
        if is_masked_sentinel and k in existing:
            # Keep original value
            entries[k] = existing[k]
        else:
            entries[k] = val

        if k in existing_secrets or _is_secret_key(k):
            secret_keys.add(k)

    write_llm_config(conn, entries, secret_keys)
    conn.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# secrets
# ---------------------------------------------------------------------------


@router.get("/secrets")
def get_secrets(conn: Annotated[Connection, Depends(get_db)]) -> dict[str, Any]:
    from website_profiling.db.google_app_store import read_google_app_settings

    llm_rows = _read_llm_config_full(conn)
    state: dict[str, Any] = {}
    for row in llm_rows:
        k = str(row["key"])
        v = str(row["value"])
        is_secret = bool(row.get("is_secret")) or _is_secret_key(k)
        if is_secret and v:
            state[k] = _MASK
            state[f"{k}_masked"] = True
        elif v:
            state[k] = v

    google = read_google_app_settings(conn)
    for field in ("client_id", "client_secret", "developer_token", "login_customer_id"):
        raw = str(google.get(field) or "")
        if raw:
            state[f"google_{field}"] = _MASK if _is_secret_key(field) else raw
            if _is_secret_key(field):
                state[f"google_{field}_masked"] = True
    state["google_has_service_account"] = bool(google.get("service_account_json"))

    return {"state": state, "source": "db"}


class SecretsBody(BaseModel):
    state: dict[str, Any]


@router.put("/secrets")
def put_secrets(
    body: SecretsBody,
    conn: Annotated[Connection, Depends(get_db)],
) -> dict[str, Any]:
    from website_profiling.db.config_store import read_llm_config, write_llm_config
    from website_profiling.db.google_app_store import read_google_app_settings, save_google_app_settings

    existing_llm = read_llm_config(conn)
    existing_rows = _read_llm_config_full(conn)
    existing_secrets_set: set[str] = {str(r["key"]) for r in existing_rows if r.get("is_secret")}

    llm_updates: dict[str, str] = dict(existing_llm)
    llm_secret_keys: set[str] = set(existing_secrets_set)
    google_patch: dict[str, Any] = {}

    for k, v in body.state.items():
        if k.endswith("_masked") or k == "google_has_service_account":
            continue

        val = str(v) if v is not None else ""
        is_masked_sentinel = val.strip() in (_MASK, "••••") or (
            val.strip().startswith("*") and len(val.strip()) <= 4
        )

        if k.startswith("google_"):
            field = k[len("google_"):]
            if field in ("client_id", "client_secret", "developer_token", "login_customer_id"):
                if not is_masked_sentinel:
                    google_patch[field] = val
        else:
            if is_masked_sentinel:
                # Preserve existing
                pass
            else:
                llm_updates[k] = val
                if _is_secret_key(k):
                    llm_secret_keys.add(k)

    write_llm_config(conn, llm_updates, llm_secret_keys)
    conn.commit()

    if google_patch:
        save_google_app_settings(conn, google_patch)

    return {"ok": True}


# ---------------------------------------------------------------------------
# app-settings
# ---------------------------------------------------------------------------


@router.get("/app-settings")
def get_app_setting(
    conn: Annotated[Connection, Depends(get_db)],
    key: str = Query(..., description="Settings key to retrieve"),
) -> dict[str, Any]:
    if not key or not key.strip():
        raise HTTPException(status_code=400, detail="Missing key query parameter")
    value = _read_app_setting(conn, key.strip())
    return {"key": key.strip(), "value": value}


class AppSettingBody(BaseModel):
    key: str
    value: str


@router.put("/app-settings")
def put_app_setting(
    body: AppSettingBody,
    conn: Annotated[Connection, Depends(get_db)],
) -> dict[str, Any]:
    if not body.key or not body.key.strip():
        raise HTTPException(status_code=400, detail="key must not be empty")
    _write_app_setting(conn, body.key.strip(), body.value)
    return {"ok": True}
