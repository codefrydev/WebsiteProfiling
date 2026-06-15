"""Tests for alert_checker health and GSC staleness rules."""
from __future__ import annotations

import os
from unittest.mock import MagicMock, patch

import pytest

from website_profiling.tools.alert_checker import (
    check_all_alerts,
    check_gsc_links_stale_alerts,
    check_health_alerts,
    dispatch_email,
    dispatch_webhook,
    smtp_configured,
)


def test_check_health_alerts_no_snapshots() -> None:
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = []
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        alerts = check_health_alerts(1)

    assert alerts == []


def test_check_health_alerts_detects_drop() -> None:
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [(70, "2026-06-01"), (90, "2026-05-01")]
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        alerts = check_health_alerts(5, threshold_drop=10)

    assert len(alerts) == 1
    assert alerts[0]["type"] == "health_drop"
    assert "20 points" in alerts[0]["message"]


def test_check_health_alerts_skips_null_scores() -> None:
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [(None, "2026-06-01"), (90, "2026-05-01")]
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        alerts = check_health_alerts(5, threshold_drop=10)

    assert alerts == []


def test_check_health_alerts_ignores_small_drop() -> None:
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [(88, "2026-06-01"), (90, "2026-05-01")]
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        alerts = check_health_alerts(5, threshold_drop=10)

    assert alerts == []


def test_check_gsc_links_stale_filters_property() -> None:
    stale_items = [
        {"property_id": 1, "message": "stale", "severity": "low"},
        {"property_id": 2, "message": "other", "severity": "low"},
    ]
    with patch(
        "website_profiling.integrations.google.gsc_links_sync.check_stale_gsc_links_imports",
        return_value=stale_items,
    ):
        alerts = check_gsc_links_stale_alerts(1)

    assert len(alerts) == 1
    assert alerts[0]["property_id"] == 1


def test_check_all_alerts_combines() -> None:
    with patch("website_profiling.tools.alert_checker.check_health_alerts", return_value=[{"type": "health_drop"}]):
        with patch("website_profiling.tools.alert_checker.check_gsc_links_stale_alerts", return_value=[{"type": "gsc_links_stale"}]):
            combined = check_all_alerts(1)
    assert len(combined) == 2


@patch("urllib.request.urlopen")
def test_dispatch_webhook_success(mock_urlopen) -> None:
    mock_urlopen.return_value.__enter__.return_value = MagicMock()
    assert dispatch_webhook("https://hooks.example/alerts", {"alerts": []}) is True


@patch("urllib.request.urlopen", side_effect=OSError("network"))
def test_dispatch_webhook_failure(_mock_urlopen) -> None:
    assert dispatch_webhook("https://hooks.example/alerts", {"alerts": []}) is False


def test_dispatch_webhook_empty_url() -> None:
    assert dispatch_webhook("  ", {"alerts": []}) is False


def test_smtp_configured_requires_host_and_from(monkeypatch) -> None:
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_FROM", raising=False)
    assert smtp_configured() is False
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "alerts@example.com")
    assert smtp_configured() is True


def test_dispatch_email_empty_recipient() -> None:
    assert dispatch_email("  ", {"alerts": []}) is False


def test_dispatch_email_skips_when_smtp_not_configured(monkeypatch) -> None:
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_FROM", raising=False)
    assert dispatch_email("ops@example.com", {"alerts": [{"message": "x"}]}) is False


@patch("website_profiling.tools.alert_checker.smtplib.SMTP")
def test_dispatch_email_success(mock_smtp_cls, monkeypatch) -> None:
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "alerts@example.com")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_USE_TLS", "true")
    smtp = MagicMock()
    mock_smtp_cls.return_value.__enter__.return_value = smtp
    payload = {"property_id": 1, "alerts": [{"severity": "high", "message": "Health drop"}]}
    assert dispatch_email("ops@example.com", payload) is True
    smtp.starttls.assert_called_once()
    smtp.send_message.assert_called_once()


@patch("website_profiling.tools.alert_checker.smtplib.SMTP")
def test_dispatch_email_with_auth(mock_smtp_cls, monkeypatch) -> None:
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "alerts@example.com")
    monkeypatch.setenv("SMTP_USER", "alerts@example.com")
    monkeypatch.setenv("SMTP_PASS", "secret")
    monkeypatch.setenv("SMTP_USE_TLS", "false")
    smtp = MagicMock()
    mock_smtp_cls.return_value.__enter__.return_value = smtp
    assert dispatch_email("ops@example.com", {"alerts": [{"message": "x"}]}) is True
    smtp.login.assert_called_once_with("alerts@example.com", "secret")
    smtp.starttls.assert_not_called()


def test_format_alert_email_body_empty_alerts() -> None:
    from website_profiling.tools.alert_checker import _format_alert_email_body

    body = _format_alert_email_body({"property_id": 5, "alerts": []})
    assert "No alerts." in body
    assert "Property ID: 5" in body


def test_format_alert_email_body_skips_non_dict_alerts() -> None:
    from website_profiling.tools.alert_checker import _format_alert_email_body

    body = _format_alert_email_body({"alerts": ["bad", {"severity": "low", "message": "ok"}]})
    assert "2. [low] ok" in body
    assert "bad" not in body


@patch("website_profiling.tools.alert_checker.smtplib.SMTP", side_effect=OSError("smtp down"))
def test_dispatch_email_failure(_mock_smtp, monkeypatch) -> None:
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM", "alerts@example.com")
    assert dispatch_email("ops@example.com", {"alerts": [{"message": "x"}]}) is False


@pytest.fixture
def property_id():
    if not (os.environ.get("DATABASE_URL") or "").strip():
        pytest.skip("DATABASE_URL not set")
    from website_profiling.db import db_session
    from website_profiling.db.property_store import upsert_property_by_domain

    with db_session() as conn:
        pid = upsert_property_by_domain(conn, "Alert Test", "alert-test.example")
        conn.execute("DELETE FROM audit_health_snapshots WHERE property_id = %s", (pid,))
        conn.commit()
    yield pid
    with db_session() as conn:
        conn.execute("DELETE FROM audit_health_snapshots WHERE property_id = %s", (pid,))
        conn.commit()


@pytest.mark.integration
def test_check_health_alerts_postgres_integration(property_id) -> None:
    from website_profiling.db import db_session

    with db_session() as conn:
        conn.execute(
            """INSERT INTO audit_health_snapshots
               (property_id, report_id, health_score, category_scores, issue_counts, generated_at)
               VALUES (%s, 9001, 90, '{}', '{}', NOW() - INTERVAL '2 days')""",
            (property_id,),
        )
        conn.execute(
            """INSERT INTO audit_health_snapshots
               (property_id, report_id, health_score, category_scores, issue_counts, generated_at)
               VALUES (%s, 9002, 70, '{}', '{}', NOW() - INTERVAL '1 day')""",
            (property_id,),
        )
        conn.commit()

    alerts = check_health_alerts(property_id, threshold_drop=10)
    assert any(a["type"] == "health_drop" for a in alerts)
