"""Add client_preferences singleton for cross-browser UI state.

Revision ID: 028_client_preferences
Revises: 027_drop_eav_config
"""
from __future__ import annotations

from alembic import op

revision = "028_client_preferences"
down_revision = "027_drop_eav_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
CREATE TABLE client_preferences (
    id BIGINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    default_landing_view TEXT NOT NULL DEFAULT 'overview',
    chat_fab_corner TEXT NOT NULL DEFAULT 'bottom-right',
    sidebar_collapsed BOOLEAN NOT NULL DEFAULT false,
    network_view_mode TEXT NOT NULL DEFAULT '2d',
    content_studio_ai_enabled BOOLEAN NOT NULL DEFAULT true,
    pipeline_python_exe TEXT NOT NULL DEFAULT 'python3',
    pipeline_repo_root TEXT NOT NULL DEFAULT '',
    radius_scale TEXT NOT NULL DEFAULT 'default',
    density_scale TEXT NOT NULL DEFAULT 'default',
    animations_enabled BOOLEAN NOT NULL DEFAULT true,
    font_size_scale TEXT NOT NULL DEFAULT 'default',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO client_preferences (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

UPDATE client_preferences cp SET
    radius_scale = COALESCE(up.ui_prefs_json->>'radius', cp.radius_scale),
    density_scale = COALESCE(up.ui_prefs_json->>'density', cp.density_scale),
    animations_enabled = CASE
        WHEN up.ui_prefs_json ? 'animations'
        THEN (up.ui_prefs_json->>'animations')::boolean
        ELSE cp.animations_enabled
    END,
    font_size_scale = COALESCE(up.ui_prefs_json->>'fontSize', cp.font_size_scale)
FROM ui_preferences up
WHERE cp.id = 1 AND up.id = 1
  AND up.ui_prefs_json IS NOT NULL;
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS client_preferences CASCADE;")
