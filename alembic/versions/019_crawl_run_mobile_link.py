"""Add mobile_run_id to crawl_runs for pairing desktop+mobile dual crawls.

Revision ID: 019_crawl_run_mobile_link
Revises: 018_link_edge_position
"""
from __future__ import annotations

from alembic import op

revision = "019_crawl_run_mobile_link"
down_revision = "018_link_edge_position"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE crawl_runs
        ADD COLUMN IF NOT EXISTS mobile_run_id INT REFERENCES crawl_runs(id)
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE crawl_runs DROP COLUMN IF EXISTS mobile_run_id")
