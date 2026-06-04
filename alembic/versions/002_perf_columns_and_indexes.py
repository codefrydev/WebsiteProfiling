"""Denormalized columns and indexes for read/write performance.

Revision ID: 002
Revises: 001
Create Date: 2026-06-02
"""
from __future__ import annotations

from alembic import op

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE report_payload
            ADD COLUMN IF NOT EXISTS site_name TEXT,
            ADD COLUMN IF NOT EXISTS canonical_domain TEXT;

        UPDATE report_payload
        SET site_name = COALESCE(site_name, data->>'site_name'),
            canonical_domain = COALESCE(canonical_domain, NULL)
        WHERE site_name IS NULL;

        ALTER TABLE crawl_results
            ADD COLUMN IF NOT EXISTS status TEXT,
            ADD COLUMN IF NOT EXISTS title TEXT;

        UPDATE crawl_results
        SET status = COALESCE(status, data->>'status'),
            title = COALESCE(title, data->>'title')
        WHERE status IS NULL OR title IS NULL;

        CREATE INDEX IF NOT EXISTS idx_report_payload_generated_at
            ON report_payload (generated_at DESC);

        CREATE INDEX IF NOT EXISTS idx_report_payload_canonical_domain
            ON report_payload (canonical_domain);

        CREATE INDEX IF NOT EXISTS idx_crawl_results_run_status
            ON crawl_results (crawl_run_id, status);

        DROP INDEX IF EXISTS idx_kw_history_keyword;
        CREATE INDEX IF NOT EXISTS idx_kw_history_keyword_id
            ON keyword_history (keyword, id DESC);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_kw_history_keyword_id;
        CREATE INDEX IF NOT EXISTS idx_kw_history_keyword ON keyword_history (keyword);

        DROP INDEX IF EXISTS idx_crawl_results_run_status;
        DROP INDEX IF EXISTS idx_report_payload_canonical_domain;
        DROP INDEX IF EXISTS idx_report_payload_generated_at;

        ALTER TABLE crawl_results DROP COLUMN IF EXISTS title;
        ALTER TABLE crawl_results DROP COLUMN IF EXISTS status;

        ALTER TABLE report_payload DROP COLUMN IF EXISTS canonical_domain;
        ALTER TABLE report_payload DROP COLUMN IF EXISTS site_name;
    """)
