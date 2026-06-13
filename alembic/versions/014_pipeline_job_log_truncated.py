"""Add log_truncated flag to pipeline_jobs.

Revision ID: 014_pipeline_log_truncated
Revises: 013_crawl_discovery_edges
"""
from __future__ import annotations

from alembic import op

revision = "014_pipeline_log_truncated"
down_revision = "013_crawl_discovery_edges"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE pipeline_jobs
            ADD COLUMN IF NOT EXISTS log_truncated BOOLEAN NOT NULL DEFAULT false;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE pipeline_jobs
            DROP COLUMN IF EXISTS log_truncated;
    """)
