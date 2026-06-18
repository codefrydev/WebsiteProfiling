"""Load remote MCP HTTP settings from environment and pipeline_config."""
from __future__ import annotations

import os
from dataclasses import dataclass

from ..db.config_store import read_pipeline_config
from ..db.storage import db_session


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


def _parse_csv(raw: str) -> list[str]:
    if not raw.strip():
        return []
    return [part.strip() for part in raw.split(",") if part.strip()]


@dataclass(frozen=True)
class McpHttpSettings:
    token: str
    allowed_hosts: list[str]
    allowed_origins: list[str]
    domain: str = "core"

    @property
    def remote_access_configured(self) -> bool:
        return bool(self.token and self.allowed_hosts)


def _load_pipeline_mcp_settings() -> dict[str, str]:
    try:
        with db_session() as conn:
            known, _unknown = read_pipeline_config(conn)
        return known
    except Exception:
        return {}


def load_mcp_http_settings() -> McpHttpSettings:
    """Merge MCP HTTP settings: environment overrides database values."""
    pipeline = _load_pipeline_mcp_settings()

    token = _env("WP_MCP_TOKEN") or str(pipeline.get("mcp_token", "")).strip()

    hosts_raw = _env("WP_MCP_ALLOWED_HOSTS") or str(pipeline.get("mcp_allowed_hosts", "")).strip()
    origins_raw = _env("WP_MCP_ALLOWED_ORIGINS") or str(pipeline.get("mcp_allowed_origins", "")).strip()
    domain = _env("WP_MCP_DOMAIN") or str(pipeline.get("mcp_domain", "")).strip().lower() or "core"

    return McpHttpSettings(
        token=token,
        allowed_hosts=_parse_csv(hosts_raw),
        allowed_origins=_parse_csv(origins_raw),
        domain=domain,
    )
