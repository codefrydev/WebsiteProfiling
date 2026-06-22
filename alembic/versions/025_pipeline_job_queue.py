"""Add pipeline job queue columns for the Python worker.

Adds: command, cancel_requested, pause_requested, worker_pid, status='pending'.

Revision ID: 025_pipeline_job_queue
Revises: 014_pipeline_log_truncated
"""
from __future__ import annotations

from alembic import op

revision = "025_pipeline_job_queue"
down_revision = "024_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE pipeline_jobs
            ADD COLUMN IF NOT EXISTS command TEXT,
            ADD COLUMN IF NOT EXISTS cancel_requested BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS pause_requested BOOLEAN NOT NULL DEFAULT false,
            ADD COLUMN IF NOT EXISTS worker_pid INTEGER;
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE pipeline_jobs
            DROP COLUMN IF EXISTS worker_pid,
            DROP COLUMN IF EXISTS pause_requested,
            DROP COLUMN IF EXISTS cancel_requested,
            DROP COLUMN IF EXISTS command;
    """)
