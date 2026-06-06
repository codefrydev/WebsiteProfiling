"""Tests for scheduled audit runner."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from website_profiling.tools.schedule_runner import _cron_matches, run_due_scheduled_audits


def test_cron_matches_current_minute() -> None:
    now = datetime(2026, 6, 7, 14, 30, tzinfo=timezone.utc)
    assert _cron_matches("30 14 * * *", now) is True
    assert _cron_matches("31 14 * * *", now) is False


def test_cron_matches_weekday() -> None:
    # 2026-06-07 is Sunday (weekday 6)
    now = datetime(2026, 6, 7, 10, 0, tzinfo=timezone.utc)
    assert _cron_matches("0 10 * * 6", now) is True
    assert _cron_matches("0 10 * * 0", now) is False


def test_cron_invalid_expression() -> None:
    now = datetime(2026, 6, 7, 10, 0, tzinfo=timezone.utc)
    assert _cron_matches("bad cron", now) is False


def test_run_due_scheduled_audits_spawns_matching_property() -> None:
    now = datetime(2026, 6, 7, 14, 30, tzinfo=timezone.utc)
    row = (42, "Scheduled Site", "30 14 * * *")
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [row]
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        with patch("website_profiling.tools.schedule_runner.datetime") as mock_dt:
            mock_dt.now.return_value = now
            with patch("website_profiling.tools.schedule_runner._spawn_audit_for_property") as mock_spawn:
                started = run_due_scheduled_audits()

    assert started == 1
    mock_spawn.assert_called_once_with(42, conn)


def test_run_due_scheduled_audits_skips_non_matching_cron() -> None:
    now = datetime(2026, 6, 7, 14, 30, tzinfo=timezone.utc)
    row = (42, "Scheduled Site", "0 9 * * *")
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = [row]
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        with patch("website_profiling.tools.schedule_runner.datetime") as mock_dt:
            mock_dt.now.return_value = now
            with patch("website_profiling.tools.schedule_runner._spawn_audit_for_property") as mock_spawn:
                started = run_due_scheduled_audits()

    assert started == 0
    mock_spawn.assert_not_called()


def test_spawn_audit_applies_preset() -> None:
    from website_profiling.tools import schedule_runner

    conn = MagicMock()
    written: dict = {}

    with patch("website_profiling.db.property_store.get_property_by_id") as mock_prop:
        mock_prop.return_value = {
            "id": 5,
            "site_url": "https://example.com",
            "default_crawl_preset": "spa",
        }
        with patch(
            "website_profiling.db.config_store.read_pipeline_config",
            return_value=({"max_pages": "100"}, {}),
        ):
            with patch(
                "website_profiling.db.config_store.write_pipeline_config",
                side_effect=lambda _c, known, _u: written.update(known),
            ):
                with patch("website_profiling.tools.schedule_runner.subprocess.Popen") as mock_popen:
                    schedule_runner._spawn_audit_for_property(5, conn)

    assert written.get("active_property_id") == "5"
    assert written.get("start_url") == "https://example.com"
    assert written.get("crawl_render_mode") == "auto"
    mock_popen.assert_called_once()


def test_spawn_audit_skips_missing_property(capsys) -> None:
    from website_profiling.tools import schedule_runner

    with patch("website_profiling.db.property_store.get_property_by_id", return_value=None):
        schedule_runner._spawn_audit_for_property(99, MagicMock())
    assert "not found" in capsys.readouterr().out


def test_cron_matches_wrong_hour() -> None:
    now = datetime(2026, 6, 7, 14, 30, tzinfo=timezone.utc)
    assert _cron_matches("30 15 * * *", now) is False


def test_run_gsc_links_staleness_alerts_delegates() -> None:
    from website_profiling.tools.schedule_runner import run_gsc_links_staleness_alerts

    with patch(
        "website_profiling.integrations.google.gsc_links_sync.check_stale_gsc_links_imports",
        return_value=[{"property_id": 1, "message": "stale"}],
    ):
        assert len(run_gsc_links_staleness_alerts()) == 1


def test_name_main_guard(capsys, monkeypatch) -> None:
    import runpy

    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@127.0.0.1:5432/test")
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = []
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        with patch(
            "website_profiling.integrations.google.gsc_links_sync.check_stale_gsc_links_imports",
            return_value=[],
        ):
            runpy.run_module(
                "website_profiling.tools.schedule_runner",
                run_name="__main__",
                alter_sys=False,
            )

    assert "Started 0 scheduled audit" in capsys.readouterr().out


def test_main_runs(capsys) -> None:
    from website_profiling.tools.schedule_runner import main

    with patch("website_profiling.tools.schedule_runner.run_due_scheduled_audits", return_value=1):
        with patch(
            "website_profiling.tools.schedule_runner.run_gsc_links_staleness_alerts",
            return_value=[{"property_id": 1, "message": "stale"}],
        ):
            main()
    out = capsys.readouterr().out
    assert "Started 1 scheduled audit" in out
    assert "GSC Links stale" in out
    assert "[1] stale" in out
