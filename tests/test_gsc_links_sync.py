"""Tests for GSC Links sync / staleness helpers."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from website_profiling.integrations.google.gsc_links_sync import check_stale_gsc_links_imports


def test_check_stale_flags_missing_import() -> None:
    row = (42, "Test Site", None)
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [row]
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        stale = check_stale_gsc_links_imports(max_age_days=7)

    assert len(stale) == 1
    assert stale[0]["property_id"] == 42
    assert "No GSC Links import yet" in stale[0]["message"]
    assert stale[0]["severity"] == "medium"


def test_check_stale_flags_old_import() -> None:
    old = datetime.now(timezone.utc) - timedelta(days=10)
    row = (7, "Old Site", old)
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [row]
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        stale = check_stale_gsc_links_imports(max_age_days=7)

    assert len(stale) == 1
    assert stale[0]["property_id"] == 7
    assert "days old" in stale[0]["message"]


def test_check_stale_skips_recent_import() -> None:
    recent = datetime.now(timezone.utc) - timedelta(days=1)
    row = (3, "Fresh Site", recent)
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [row]
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        stale = check_stale_gsc_links_imports(max_age_days=7)

    assert stale == []
