"""Per-property Google OAuth columns and scoped google_data.

Revision ID: 005_property_google
Revises: 004_page_google_snapshots
"""

from __future__ import annotations

from alembic import op

revision = "005_property_google"
down_revision = "004_page_google_snapshots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE properties
            ADD COLUMN IF NOT EXISTS google_auth_mode TEXT,
            ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
            ADD COLUMN IF NOT EXISTS google_connected_at TIMESTAMPTZ,
            ADD COLUMN IF NOT EXISTS google_connected_email TEXT,
            ADD COLUMN IF NOT EXISTS google_date_range_days INTEGER;

        ALTER TABLE google_data
            ADD COLUMN IF NOT EXISTS property_id BIGINT
                REFERENCES properties(id) ON DELETE SET NULL;

        CREATE INDEX IF NOT EXISTS idx_google_data_property_fetched
            ON google_data (property_id, fetched_at DESC);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_google_data_property_fetched;
        ALTER TABLE google_data DROP COLUMN IF EXISTS property_id;
        ALTER TABLE properties
            DROP COLUMN IF EXISTS google_date_range_days,
            DROP COLUMN IF EXISTS google_connected_email,
            DROP COLUMN IF EXISTS google_connected_at,
            DROP COLUMN IF EXISTS google_refresh_token,
            DROP COLUMN IF EXISTS google_auth_mode;
        """
    )
