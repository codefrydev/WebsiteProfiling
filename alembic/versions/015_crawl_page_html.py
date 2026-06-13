"""Add crawl_page_html table for per-URL raw HTML storage.

Revision ID: 015_crawl_page_html
Revises: 014_pipeline_log_truncated
"""
from __future__ import annotations

from alembic import op

revision = "015_crawl_page_html"
down_revision = "014_pipeline_log_truncated"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE crawl_page_html (
            crawl_run_id BIGINT NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
            url TEXT NOT NULL,
            html TEXT NOT NULL,
            status TEXT,
            content_type TEXT,
            fetch_method TEXT NOT NULL DEFAULT 'static',
            byte_length INTEGER NOT NULL DEFAULT 0,
            captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (crawl_run_id, url)
        );
        CREATE INDEX IF NOT EXISTS idx_crawl_page_html_run
            ON crawl_page_html (crawl_run_id);
    """)


def downgrade() -> None:
    op.execute("""
        DROP INDEX IF EXISTS idx_crawl_page_html_run;
        DROP TABLE IF EXISTS crawl_page_html;
    """)
