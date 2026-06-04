"""load_config_from_db error handling."""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

from website_profiling.config import load_config_from_db


def test_returns_empty_when_database_url_unset(monkeypatch, capsys):
    monkeypatch.delenv("DATABASE_URL", raising=False)
    assert load_config_from_db() == {}
    assert capsys.readouterr().err == ""


def test_logs_warning_on_db_error(monkeypatch, capsys):
    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@127.0.0.1:5432/test")

    mock_session = MagicMock()
    mock_session.__enter__.side_effect = RuntimeError("connection refused")

    with patch("website_profiling.db.db_session", return_value=mock_session):
        result = load_config_from_db()

    assert result == {}
    err = capsys.readouterr().err
    assert "Could not load pipeline_config" in err
    assert "connection refused" in err
