"""Config routes: typed pipeline-settings and ui-preferences only.

Secrets and llm-settings are served by AiService via BFF.
"""
from __future__ import annotations

from typing import Annotated, Any, Optional

from fastapi import APIRouter, Depends
from psycopg import Connection
from pydantic import BaseModel

from ..deps import get_db

router = APIRouter(tags=["config"])


@router.get("/pipeline-settings")
def get_pipeline_settings(conn: Annotated[Connection, Depends(get_db)]) -> dict[str, Any]:
    from website_profiling.db.config_store import read_pipeline_config
    from website_profiling.db.typed_config.pipeline_settings_store import (
        read_all_pipeline_domains,
        read_workspace_settings,
    )

    state, _ = read_pipeline_config(conn)
    domains = read_all_pipeline_domains(conn)
    workspace = read_workspace_settings(conn)

    def _domain_payload(model, exclude: frozenset[str] = frozenset({"updated_at"})) -> dict[str, Any]:
        return {
            k: getattr(model, k, "")
            for k in model.__dataclass_fields__
            if k not in exclude
        }

    return {
        "crawl": _domain_payload(domains["crawl_settings"]),
        "report": _domain_payload(domains["report_settings"]),
        "lighthouse": _domain_payload(domains["lighthouse_settings"]),
        "analysis": _domain_payload(domains["content_analysis_settings"]),
        "auditSteps": _domain_payload(domains["audit_step_settings"]),
        "google": _domain_payload(domains["google_pipeline_settings"]),
        "keywords": _domain_payload(domains["keyword_settings"]),
        "workspace": {
            "activePropertyId": workspace.active_property_id,
            "warningMapperInput": workspace.warning_mapper_input,
            "warningMapperInputType": workspace.warning_mapper_input_type,
        },
        "state": state,
        "source": "db",
    }


class PipelineSettingsBody(BaseModel):
    state: dict[str, Any]


@router.put("/pipeline-settings")
def put_pipeline_settings(
    body: PipelineSettingsBody,
    conn: Annotated[Connection, Depends(get_db)],
) -> dict[str, Any]:
    from website_profiling.db.config_store import write_pipeline_config

    coerced: dict[str, str] = {str(k): str(v) for k, v in body.state.items()}
    write_pipeline_config(conn, coerced)
    return {"ok": True, "source": "db"}


class UiPreferencesResponse(BaseModel):
    brandName: str = ""
    brandSubtitle: str = ""
    brandLogoUrl: str = ""
    customThemeJson: Optional[dict[str, Any]] = None
    uiPrefsJson: Optional[dict[str, Any]] = None


class UiPreferencesBody(BaseModel):
    brandName: Optional[str] = None
    brandSubtitle: Optional[str] = None
    brandLogoUrl: Optional[str] = None
    customThemeJson: Optional[dict[str, Any]] = None
    uiPrefsJson: Optional[dict[str, Any]] = None


@router.get("/ui-preferences")
def get_ui_preferences(conn: Annotated[Connection, Depends(get_db)]) -> UiPreferencesResponse:
    from website_profiling.db.typed_config.ui_preferences_store import read_ui_preferences

    prefs = read_ui_preferences(conn)
    return UiPreferencesResponse(
        brandName=prefs.brand_name or "",
        brandSubtitle=prefs.brand_subtitle or "",
        brandLogoUrl=prefs.brand_logo_url or "",
        customThemeJson=prefs.custom_theme_json if isinstance(prefs.custom_theme_json, dict) else None,
        uiPrefsJson=prefs.ui_prefs_json if isinstance(prefs.ui_prefs_json, dict) else None,
    )


@router.put("/ui-preferences")
def put_ui_preferences(
    body: UiPreferencesBody,
    conn: Annotated[Connection, Depends(get_db)],
) -> dict[str, Any]:
    from website_profiling.db.typed_config.ui_preferences_store import patch_ui_preferences

    updates: dict[str, str] = {}
    if body.brandName is not None:
        updates["brand_name"] = body.brandName
    if body.brandSubtitle is not None:
        updates["brand_subtitle"] = body.brandSubtitle
    if body.brandLogoUrl is not None:
        updates["brand_logo_url"] = body.brandLogoUrl
    if body.customThemeJson is not None:
        import json

        updates["custom_theme"] = json.dumps(body.customThemeJson)
    if body.uiPrefsJson is not None:
        import json

        updates["ui_prefs"] = json.dumps(body.uiPrefsJson)
    patch_ui_preferences(conn, updates)
    conn.commit()
    return {"ok": True}


class ClientPreferencesResponse(BaseModel):
    defaultLandingView: str = "overview"
    chatFabCorner: str = "bottom-right"
    sidebarCollapsed: bool = False
    networkViewMode: str = "2d"
    contentStudioAiEnabled: bool = True
    pipelinePythonExe: str = "python3"
    pipelineRepoRoot: str = ""
    radiusScale: str = "default"
    densityScale: str = "default"
    animationsEnabled: bool = True
    fontSizeScale: str = "default"


class ClientPreferencesBody(BaseModel):
    defaultLandingView: Optional[str] = None
    chatFabCorner: Optional[str] = None
    sidebarCollapsed: Optional[bool] = None
    networkViewMode: Optional[str] = None
    contentStudioAiEnabled: Optional[bool] = None
    pipelinePythonExe: Optional[str] = None
    pipelineRepoRoot: Optional[str] = None
    radiusScale: Optional[str] = None
    densityScale: Optional[str] = None
    animationsEnabled: Optional[bool] = None
    fontSizeScale: Optional[str] = None


def _client_preferences_response(prefs) -> ClientPreferencesResponse:
    return ClientPreferencesResponse(
        defaultLandingView=prefs.default_landing_view or "overview",
        chatFabCorner=prefs.chat_fab_corner or "bottom-right",
        sidebarCollapsed=bool(prefs.sidebar_collapsed),
        networkViewMode=prefs.network_view_mode or "2d",
        contentStudioAiEnabled=bool(prefs.content_studio_ai_enabled),
        pipelinePythonExe=prefs.pipeline_python_exe or "python3",
        pipelineRepoRoot=prefs.pipeline_repo_root or "",
        radiusScale=prefs.radius_scale or "default",
        densityScale=prefs.density_scale or "default",
        animationsEnabled=bool(prefs.animations_enabled),
        fontSizeScale=prefs.font_size_scale or "default",
    )


@router.get("/client-preferences")
def get_client_preferences(conn: Annotated[Connection, Depends(get_db)]) -> ClientPreferencesResponse:
    from website_profiling.db.typed_config.client_preferences_store import read_client_preferences

    return _client_preferences_response(read_client_preferences(conn))


@router.put("/client-preferences")
def put_client_preferences(
    body: ClientPreferencesBody,
    conn: Annotated[Connection, Depends(get_db)],
) -> dict[str, Any]:
    from website_profiling.db.typed_config.client_preferences_store import patch_client_preferences

    field_map = {
        "defaultLandingView": "default_landing_view",
        "chatFabCorner": "chat_fab_corner",
        "sidebarCollapsed": "sidebar_collapsed",
        "networkViewMode": "network_view_mode",
        "contentStudioAiEnabled": "content_studio_ai_enabled",
        "pipelinePythonExe": "pipeline_python_exe",
        "pipelineRepoRoot": "pipeline_repo_root",
        "radiusScale": "radius_scale",
        "densityScale": "density_scale",
        "animationsEnabled": "animations_enabled",
        "fontSizeScale": "font_size_scale",
    }
    updates: dict[str, Any] = {}
    for camel, snake in field_map.items():
        value = getattr(body, camel)
        if value is not None:
            updates[snake] = value
    if updates:
        patch_client_preferences(conn, updates)
        conn.commit()
    return {"ok": True}
