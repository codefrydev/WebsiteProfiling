"""Add position column to link_edges for nav/header/content/footer/sidebar classification.

Revision ID: 018_link_edge_position
Revises: 017_content_drafts
"""
from __future__ import annotations

from alembic import op

revision = "018_link_edge_position"
down_revision = "017_content_drafts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE link_edges
        ADD COLUMN IF NOT EXISTS position TEXT NOT NULL DEFAULT 'content'
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE link_edges DROP COLUMN IF EXISTS position")
