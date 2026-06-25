"""Config routes: pipeline-config and app-settings.

Secrets, llm-config, and app-level Google credential writes are served by AiService via BFF.
"""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg import Connection
from pydantic import BaseModel

from ..deps import get_db

router = APIRouter(tags=["config"])


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


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
    return {"ok": True, "source": "db"}


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
