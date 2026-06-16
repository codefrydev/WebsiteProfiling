"""
Load LLM settings from llm_config table only (UI-managed).
Not read from pipeline-config.txt or --config files.
"""
from __future__ import annotations

import os
from typing import Optional

_ENV_KEY_BY_PROVIDER = {
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "groq": "GROQ_API_KEY",
}


def load_llm_config_from_db() -> dict[str, str]:
    try:
        from .db import db_session
        from .db.storage import read_llm_config

        with db_session() as conn:
            cfg = read_llm_config(conn)
    except Exception:
        return {}

    if not cfg:
        return {}

    provider = (cfg.get("llm_provider") or "none").strip().lower()
    if provider and provider != "none":
        if not (cfg.get("llm_api_key") or "").strip():
            env_var = _ENV_KEY_BY_PROVIDER.get(provider)
            if env_var:
                env_val = (os.environ.get(env_var) or "").strip()
                if env_val:
                    cfg = dict(cfg)
                    cfg["llm_api_key"] = env_val
                    cfg["_llm_api_key_source"] = "env"
    return cfg


def llm_is_enabled(cfg: dict[str, str]) -> bool:
    if not cfg:
        return False
    if str(cfg.get("llm_enabled", "")).lower() not in ("true", "1", "yes"):
        return False
    provider = (cfg.get("llm_provider") or "none").strip().lower()
    return provider not in ("", "none")
