"""Add crawl_page_markdown table for per-URL extracted markdown storage.

Revision ID: 023_crawl_page_markdown
Revises: 022_dashboards
"""
from __future__ import annotations

from alembic import op

revision = "023_crawl_page_markdown"
down_revision = "022_dashboards"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE crawl_page_markdown (
            crawl_run_id BIGINT NOT NULL REFERENCES crawl_runs(id) ON DELETE CASCADE,
            url TEXT NOT NULL,
            property_id BIGINT REFERENCES properties(id) ON DELETE SET NULL,
            title TEXT,
            markdown TEXT NOT NULL,
            word_count INTEGER NOT NULL DEFAULT 0,
            strategy TEXT NOT NULL DEFAULT 'main_only',
            source_byte_length INTEGER NOT NULL DEFAULT 0,
            extracted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            PRIMARY KEY (crawl_run_id, url)
        )
    """)
    op.execute("""
        CREATE INDEX idx_crawl_page_markdown_run
            ON crawl_page_markdown (crawl_run_id)
    """)
    op.execute("""
        CREATE INDEX idx_crawl_page_markdown_property
            ON crawl_page_markdown (property_id)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_crawl_page_markdown_property")
    op.execute("DROP INDEX IF EXISTS idx_crawl_page_markdown_run")
    op.execute("DROP TABLE IF EXISTS crawl_page_markdown")
