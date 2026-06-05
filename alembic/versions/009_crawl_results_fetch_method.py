"""Add fetch_method column to crawl_results for SQL-level filtering."""

from alembic import op

revision = "009_crawl_results_fetch_method"
down_revision = "008_crawl_render_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE crawl_results ADD COLUMN IF NOT EXISTS fetch_method TEXT DEFAULT 'static';
        CREATE INDEX IF NOT EXISTS idx_crawl_results_run_fetch_method
            ON crawl_results (crawl_run_id, fetch_method);
        UPDATE crawl_results
        SET fetch_method = COALESCE(data->>'fetch_method', 'static')
        WHERE fetch_method IS NULL OR fetch_method = 'static';
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_crawl_results_run_fetch_method;
        ALTER TABLE crawl_results DROP COLUMN IF EXISTS fetch_method;
        """
    )
