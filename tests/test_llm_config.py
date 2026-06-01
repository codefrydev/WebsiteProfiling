"""Tests for LLM config loading."""
from __future__ import annotations

import os
import tempfile

from website_profiling.db import db_session, init_schema
from website_profiling.db.storage import write_llm_config
from website_profiling.llm_config import llm_is_enabled, load_llm_config_from_db


def test_load_llm_config_from_db():
    with tempfile.TemporaryDirectory() as tmp:
        db_path = os.path.join(tmp, "report.db")
        with db_session(db_path) as conn:
            init_schema(conn)
            write_llm_config(
                conn,
                {
                    "llm_enabled": "true",
                    "llm_provider": "ollama",
                    "llm_model": "llama3.2",
                },
                secret_keys=set(),
            )
        cfg = load_llm_config_from_db(db_path)
        assert cfg.get("llm_provider") == "ollama"
        assert llm_is_enabled(cfg)


def test_llm_disabled_by_default():
    assert not llm_is_enabled({})
    assert not llm_is_enabled({"llm_enabled": "false", "llm_provider": "openai"})
