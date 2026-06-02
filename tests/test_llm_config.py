"""Tests for LLM config loading (PostgreSQL)."""
from __future__ import annotations

import os

import pytest

from website_profiling.db import db_session
from website_profiling.db.storage import write_llm_config
from website_profiling.llm_config import llm_is_enabled, load_llm_config_from_db


@pytest.fixture(scope="module")
def require_database_url():
    if not (os.environ.get("DATABASE_URL") or "").strip():
        pytest.skip("DATABASE_URL not set — start Postgres and run alembic upgrade head")


def test_load_llm_config_from_db(require_database_url):
    with db_session() as conn:
        write_llm_config(
            conn,
            {
                "llm_enabled": "true",
                "llm_provider": "ollama",
                "llm_model": "llama3.2",
            },
            secret_keys=set(),
        )
    cfg = load_llm_config_from_db()
    assert cfg.get("llm_provider") == "ollama"
    assert llm_is_enabled(cfg)


def test_llm_disabled_by_default():
    assert not llm_is_enabled({})
    assert not llm_is_enabled({"llm_enabled": "false", "llm_provider": "openai"})
