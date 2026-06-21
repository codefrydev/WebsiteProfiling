"""Add app_settings table for generic application-level key-value settings.

Used to persist appearance customisations (custom color palette, etc.) and
any future app-level preferences that have no dedicated table.

Revision ID: 024_app_settings
Revises: 023_crawl_page_markdown
"""
from __future__ import annotations

from alembic import op

revision = "024_app_settings"
down_revision = "023_crawl_page_markdown"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE app_settings (
            key         TEXT        NOT NULL PRIMARY KEY,
            value       TEXT        NOT NULL DEFAULT '',
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS app_settings")
