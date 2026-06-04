"""Scope keyword_data and keyword_history by property.

Revision ID: 007_keyword_property_id
Revises: 006_google_app_settings
"""

from __future__ import annotations

from alembic import op

revision = "007_keyword_property_id"
down_revision = "006_google_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE keyword_data
            ADD COLUMN IF NOT EXISTS property_id BIGINT
            REFERENCES properties(id) ON DELETE CASCADE;

        CREATE INDEX IF NOT EXISTS idx_keyword_data_property_fetched
            ON keyword_data (property_id, fetched_at DESC);

        ALTER TABLE keyword_history
            ADD COLUMN IF NOT EXISTS property_id BIGINT
            REFERENCES properties(id) ON DELETE CASCADE;

        CREATE INDEX IF NOT EXISTS idx_keyword_history_property_kw
            ON keyword_history (property_id, keyword, fetched_at DESC);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_keyword_history_property_kw;
        ALTER TABLE keyword_history DROP COLUMN IF EXISTS property_id;

        DROP INDEX IF EXISTS idx_keyword_data_property_fetched;
        ALTER TABLE keyword_data DROP COLUMN IF EXISTS property_id;
        """
    )
