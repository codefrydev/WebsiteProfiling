"""Global Google OAuth app settings in PostgreSQL.

Revision ID: 006_google_app_settings
Revises: 005_property_google
"""

from __future__ import annotations

from alembic import op

revision = "006_google_app_settings"
down_revision = "005_property_google"
branch_labels = None
depends_on = None

SINGLETON_ID = 1


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE google_app_settings (
            id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
            client_id TEXT,
            client_secret TEXT,
            service_account_json JSONB,
            default_date_range_days INTEGER NOT NULL DEFAULT 28,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        INSERT INTO google_app_settings (id) VALUES (1)
        ON CONFLICT (id) DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS google_app_settings;")
