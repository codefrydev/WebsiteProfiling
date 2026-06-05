"""Property-scoped GSC Links CSV import snapshots."""

from alembic import op

revision = "010_gsc_links_data"
down_revision = "009_crawl_results_fetch_method"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS gsc_links_data (
            id BIGSERIAL PRIMARY KEY,
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            property_id BIGINT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
            data JSONB NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_gsc_links_data_property_fetched
            ON gsc_links_data (property_id, fetched_at DESC);
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DROP INDEX IF EXISTS idx_gsc_links_data_property_fetched;
        DROP TABLE IF EXISTS gsc_links_data CASCADE;
        """
    )
