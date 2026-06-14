"""Property-scoped competitor keyword gap imports.

Revision ID: 016_competitor_keyword_gap
Revises: 015_crawl_page_html
"""
from __future__ import annotations

from alembic import op

revision = "016_competitor_keyword_gap"
down_revision = "015_crawl_page_html"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS competitor_keyword_gap (
            property_id BIGINT PRIMARY KEY REFERENCES properties(id) ON DELETE CASCADE,
            data JSONB NOT NULL DEFAULT '[]',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS competitor_keyword_gap CASCADE;")
