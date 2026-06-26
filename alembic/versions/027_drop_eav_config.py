"""Drop legacy EAV config tables after typed config migration.

Revision ID: 027_drop_eav_config
Revises: 026_typed_config
"""
from __future__ import annotations

from alembic import op

revision = "027_drop_eav_config"
down_revision = "026_typed_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS llm_config CASCADE;
        DROP TABLE IF EXISTS pipeline_config CASCADE;
        DROP TABLE IF EXISTS app_settings CASCADE;
    """)


def downgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS llm_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            is_secret BOOLEAN NOT NULL DEFAULT false,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS pipeline_config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            is_unknown BOOLEAN NOT NULL DEFAULT false,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
    """)
