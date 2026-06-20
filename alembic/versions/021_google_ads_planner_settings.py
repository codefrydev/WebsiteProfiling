"""Add developer_token and login_customer_id to google_app_settings for Keyword Planner.

Revision ID: 021_google_ads_planner_settings
Revises: 020_crawl_run_pause_state
Create Date: 2026-06-19
"""
from alembic import op

revision = "021_google_ads_planner_settings"
down_revision = "020_crawl_run_pause_state"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE google_app_settings ADD COLUMN IF NOT EXISTS developer_token TEXT"
    )
    op.execute(
        "ALTER TABLE google_app_settings ADD COLUMN IF NOT EXISTS login_customer_id TEXT"
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE google_app_settings DROP COLUMN IF EXISTS developer_token"
    )
    op.execute(
        "ALTER TABLE google_app_settings DROP COLUMN IF EXISTS login_customer_id"
    )
