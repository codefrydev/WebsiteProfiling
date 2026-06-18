"""Add pause_state JSONB and paused_at to crawl_runs.

Revision ID: 020_crawl_run_pause_state
Revises: 019_crawl_run_mobile_link
Create Date: 2026-06-18
"""
from alembic import op

revision = "020_crawl_run_pause_state"
down_revision = "019_crawl_run_mobile_link"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE crawl_runs ADD COLUMN IF NOT EXISTS pause_state JSONB"
    )
    op.execute(
        "ALTER TABLE crawl_runs ADD COLUMN IF NOT EXISTS paused_at TEXT"
    )


def downgrade() -> None:
    op.execute("ALTER TABLE crawl_runs DROP COLUMN IF EXISTS pause_state")
    op.execute("ALTER TABLE crawl_runs DROP COLUMN IF EXISTS paused_at")
