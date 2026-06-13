"""Tests for full Google data blob reader."""
from __future__ import annotations

import json
from unittest.mock import MagicMock

from website_profiling.integrations.google.store import read_google_data_full


def test_read_google_data_full_returns_blob() -> None:
    blob = {"gsc_full": {"by_page": []}, "ga4_full": {"by_path": []}}
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = {"data": blob}
    result = read_google_data_full(conn, property_id=1)
    assert result == blob


def test_read_google_data_full_none_when_missing() -> None:
    conn = MagicMock()
    conn.execute.return_value.fetchone.return_value = None
    result = read_google_data_full(conn, property_id=1)
    assert result is None
