"""Add render_mode to crawl_runs for audit provenance."""

from alembic import op

revision = "008_crawl_render_mode"
down_revision = "007_keyword_property_id"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE crawl_runs ADD COLUMN IF NOT EXISTS render_mode TEXT DEFAULT 'static';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE crawl_runs DROP COLUMN IF EXISTS render_mode;
        """
    )
