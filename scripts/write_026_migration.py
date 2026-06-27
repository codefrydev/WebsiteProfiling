#!/usr/bin/env python3
"""Write alembic/versions/026_typed_config.py with DDL + backfill from EAV tables."""
from __future__ import annotations

import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
MANIFEST = json.loads((REPO / "config" / "typed_config_manifest.json").read_text())
OUT = REPO / "alembic" / "versions" / "026_typed_config.py"


def _bool_backfill(col: str, legacy: str, source: str = "llm_config") -> str:
    return (
        f"{col} = COALESCE("
        f"(SELECT LOWER(TRIM(value)) IN ('true','1','yes') FROM {source} WHERE key = '{legacy}'), "
        f"{col})"
    )


def _int_backfill(col: str, legacy: str, source: str = "llm_config") -> str:
    return (
        f"{col} = COALESCE("
        f"(SELECT NULLIF(TRIM(value), '')::INTEGER FROM {source} WHERE key = '{legacy}'), "
        f"{col})"
    )


def _text_backfill(col: str, legacy: str, source: str = "llm_config", default: str | None = None) -> str:
    if default is not None:
        return (
            f"{col} = COALESCE("
            f"(SELECT NULLIF(TRIM(value), '') FROM {source} WHERE key = '{legacy}'), "
            f"'{default}')"
        )
    return (
        f"{col} = COALESCE("
        f"(SELECT value FROM {source} WHERE key = '{legacy}'), "
        f"{col})"
    )


def _pipeline_text_backfill(col: str) -> str:
    return (
        f"{col} = COALESCE("
        f"(SELECT value FROM pipeline_config WHERE key = '{col}' AND is_unknown = false), "
        f"{col})"
    )


def build_upgrade() -> str:
    parts: list[str] = []

    # Read generated DDL
    ddl = (REPO / "scripts" / "generate_typed_config_migration.py")
    import subprocess
    result = subprocess.run(
        ["python3", str(ddl.parent / "generate_typed_config_migration.py")],
        capture_output=True,
        text=True,
        cwd=str(REPO),
    )
    parts.append(result.stdout.strip())

    # llm_settings backfill
    llm_sets = []
    spec = MANIFEST["tables"]["llm_settings"]["columns"]
    for col, col_spec in spec.items():
        legacy = col_spec["state_key"]
        t = col_spec["type"]
        if t == "bool":
            llm_sets.append(_bool_backfill(col, legacy))
        elif t == "int":
            llm_sets.append(_int_backfill(col, legacy))
        else:
            default = col_spec.get("default")
            llm_sets.append(_text_backfill(col, legacy, default=str(default) if default is not None else None))
    parts.append(f"UPDATE llm_settings SET {', '.join(llm_sets)} WHERE id = 1;")

    # llm_provider_profiles backfill
    parts.append("""
INSERT INTO llm_provider_profiles (provider, api_key, saved_model, api_key_updated_at)
SELECT p.provider,
       COALESCE((SELECT value FROM llm_config WHERE key = 'llm_api_key_' || p.provider), ''),
       COALESCE((SELECT value FROM llm_config WHERE key = 'llm_model_' || p.provider), ''),
       (SELECT updated_at FROM llm_config WHERE key = 'llm_api_key_' || p.provider)
FROM (VALUES ('openai'), ('gemini'), ('anthropic'), ('groq'), ('ollama')) AS p(provider)
ON CONFLICT (provider) DO UPDATE SET
    api_key = EXCLUDED.api_key,
    saved_model = EXCLUDED.saved_model,
    api_key_updated_at = EXCLUDED.api_key_updated_at;

UPDATE llm_provider_profiles SET api_key = (SELECT value FROM llm_config WHERE key = 'llm_api_key')
WHERE provider = (SELECT LOWER(TRIM(provider)) FROM llm_settings WHERE id = 1)
  AND EXISTS (SELECT 1 FROM llm_config WHERE key = 'llm_api_key' AND NULLIF(TRIM(value), '') IS NOT NULL)
  AND NULLIF(TRIM(api_key), '') IS NULL;
""".strip())

    # Singleton backfills from pipeline_config
    for table in ("integration_secrets", "mcp_settings", "feature_flags", "workspace_settings"):
        spec = MANIFEST["tables"][table]
        sets = []
        for col, col_spec in spec["columns"].items():
            legacy = col_spec["state_key"]
            t = col_spec.get("type", "text")
            if t == "bool":
                sets.append(_bool_backfill(col, legacy, "pipeline_config"))
            elif t == "int" and col_spec.get("nullable"):
                sets.append(
                    f"{col} = (SELECT NULLIF(TRIM(value), '')::INTEGER FROM pipeline_config "
                    f"WHERE key = '{legacy}' AND is_unknown = false)"
                )
            else:
                sets.append(_text_backfill(col, legacy, "pipeline_config"))
        parts.append(f"UPDATE {table} SET {', '.join(sets)} WHERE id = 1;")

    # ui_preferences from app_settings
    ui_sets = []
    for col, col_spec in MANIFEST["tables"]["ui_preferences"]["columns"].items():
        legacy = col_spec.get("app_key", col)
        if col_spec.get("type") == "jsonb":
            ui_sets.append(
                f"{col} = (SELECT NULLIF(TRIM(value), '')::JSONB FROM app_settings WHERE key = '{legacy}')"
            )
        else:
            ui_sets.append(
                f"{col} = COALESCE((SELECT value FROM app_settings WHERE key = '{legacy}'), {col})"
            )
    parts.append(f"UPDATE ui_preferences SET {', '.join(ui_sets)} WHERE id = 1;")

    # Pipeline domain tables
    for table, keys in MANIFEST["pipeline_domain_tables"].items():
        sets = [_pipeline_text_backfill(k) for k in keys]
        parts.append(f"UPDATE {table} SET {', '.join(sets)} WHERE id = 1;")

    return "\n\n".join(parts)


def main() -> None:
    upgrade_sql = build_upgrade()
    content = f'''"""Typed config tables replacing llm_config, pipeline_config, app_settings EAV.

Revision ID: 026_typed_config
Revises: 025_pipeline_job_queue
"""
from __future__ import annotations

from alembic import op

revision = "026_typed_config"
down_revision = "025_pipeline_job_queue"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
{upgrade_sql}
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS keyword_settings CASCADE;
        DROP TABLE IF EXISTS google_pipeline_settings CASCADE;
        DROP TABLE IF EXISTS audit_step_settings CASCADE;
        DROP TABLE IF EXISTS content_analysis_settings CASCADE;
        DROP TABLE IF EXISTS lighthouse_settings CASCADE;
        DROP TABLE IF EXISTS report_settings CASCADE;
        DROP TABLE IF EXISTS crawl_settings CASCADE;
        DROP TABLE IF EXISTS ui_preferences CASCADE;
        DROP TABLE IF EXISTS workspace_settings CASCADE;
        DROP TABLE IF EXISTS feature_flags CASCADE;
        DROP TABLE IF EXISTS mcp_settings CASCADE;
        DROP TABLE IF EXISTS integration_secrets CASCADE;
        DROP TABLE IF EXISTS llm_provider_profiles CASCADE;
        DROP TABLE IF EXISTS llm_settings CASCADE;
    """)
'''
    OUT.write_text(content, encoding="utf-8")
    print(f"Wrote {OUT} ({len(content)} bytes)")


if __name__ == "__main__":
    main()
