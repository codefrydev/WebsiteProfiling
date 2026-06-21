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
    # 2026-06-07 is Sunday (standard cron DOW 0)
    now = datetime(2026, 6, 7, 10, 0, tzinfo=timezone.utc)
    assert _cron_matches("0 10 * * 0", now) is True
    assert _cron_matches("0 10 * * 1", now) is False


def test_cron_matches_monday() -> None:
    # 2026-06-08 is Monday (standard cron DOW 1)
    now = datetime(2026, 6, 8, 10, 0, tzinfo=timezone.utc)
    assert _cron_matches("0 10 * * 1", now) is True
    assert _cron_matches("0 10 * * 0", now) is False


def test_cron_matches_invalid_minute_or_hour() -> None:
    now = datetime(2026, 6, 7, 14, 30, tzinfo=timezone.utc)
    assert _cron_matches("30 abc * * *", now) is False
    assert _cron_matches("abc 14 * * *", now) is False


def test_cron_matches_day_of_month() -> None:
    # Regression: "0 9 1 * *" previously fired EVERY day (DOM ignored); it must
    # only fire on the 1st.
    first = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)
    second = datetime(2026, 6, 2, 9, 0, tzinfo=timezone.utc)
    assert _cron_matches("0 9 1 * *", first) is True
    assert _cron_matches("0 9 1 * *", second) is False


def test_cron_matches_month_field() -> None:
    jan1 = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
    jun1 = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)
    assert _cron_matches("0 9 1 1 *", jan1) is True
    assert _cron_matches("0 9 1 1 *", jun1) is False  # wrong month


def test_cron_dom_dow_or_semantics() -> None:
    # "0 9 1 * 0" = 1st of month OR Sunday (standard cron OR-semantics).
    mon_first = datetime(2026, 6, 1, 9, 0, tzinfo=timezone.utc)   # Monday, day 1
    sunday = datetime(2026, 6, 7, 9, 0, tzinfo=timezone.utc)      # Sunday, day 7
    mon_eighth = datetime(2026, 6, 8, 9, 0, tzinfo=timezone.utc)  # Monday, day 8
    assert _cron_matches("0 9 1 * 0", mon_first) is True   # DOM matches
    assert _cron_matches("0 9 1 * 0", sunday) is True      # DOW matches
    assert _cron_matches("0 9 1 * 0", mon_eighth) is False  # neither


def test_cron_dom_list_and_invalid_field() -> None:
    fifteenth = datetime(2026, 6, 15, 9, 0, tzinfo=timezone.utc)
    assert _cron_matches("0 9 1,15 * *", fifteenth) is True
    # A malformed day-of-month token fails closed (no spurious run).
    assert _cron_matches("0 9 x * *", fifteenth) is False


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


def test_spawn_audit_sets_env_and_cwd() -> None:
    from website_profiling.tools import schedule_runner

    conn = MagicMock()
    repo_root = "/tmp/wp-repo"

    with patch("website_profiling.db.property_store.get_property_by_id") as mock_prop:
        mock_prop.return_value = {
            "id": 5,
            "site_url": "https://example.com",
            "default_crawl_preset": "spa",
        }
        with patch("website_profiling.tools.schedule_runner._repo_root", return_value=repo_root):
            with patch("website_profiling.tools.schedule_runner.subprocess.Popen") as mock_popen:
                schedule_runner._spawn_audit_for_property(5, conn)

    mock_popen.assert_called_once()
    _args, kwargs = mock_popen.call_args
    assert _args[0] == [schedule_runner.sys.executable, "-m", "src"]
    assert kwargs["cwd"] == repo_root
    env = kwargs["env"]
    assert env["WP_PROPERTY_ID"] == "5"
    assert env["WP_SCHEDULED_SPAWN"] == "1"
    assert env["PYTHONPATH"] == f"{repo_root}/src"
    assert env["WEBSITE_PROFILING_ROOT"] == repo_root


def test_repo_root_prefers_website_profiling_root_env(monkeypatch) -> None:
    from website_profiling.tools.schedule_runner import _repo_root

    monkeypatch.setenv("WEBSITE_PROFILING_ROOT", "/custom/root")
    assert _repo_root() == "/custom/root"


def test_repo_root_falls_back_to_package_parents(monkeypatch) -> None:
    from pathlib import Path

    from website_profiling.tools import schedule_runner

    monkeypatch.delenv("WEBSITE_PROFILING_ROOT", raising=False)
    expected = str(Path(schedule_runner.__file__).resolve().parents[3])
    assert schedule_runner._repo_root() == expected


def test_run_due_scheduled_audits_logs_when_multiple_properties_due(capsys) -> None:
    now = datetime(2026, 6, 7, 14, 30, tzinfo=timezone.utc)
    rows = [
        (1, "Site A", "30 14 * * *"),
        (2, "Site B", "30 14 * * *"),
    ]
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = rows
    conn.execute.return_value = cur

    with patch("website_profiling.db.storage.db_session") as mock_session:
        mock_session.return_value.__enter__.return_value = conn
        with patch("website_profiling.tools.schedule_runner.datetime") as mock_dt:
            mock_dt.now.return_value = now
            with patch("website_profiling.tools.schedule_runner._spawn_audit_for_property") as mock_spawn:
                started = run_due_scheduled_audits()

    assert started == 2
    assert mock_spawn.call_count == 2
    assert "2 properties due this minute" in capsys.readouterr().out


def test_spawn_audit_skips_missing_property(capsys) -> None:
    from website_profiling.tools import schedule_runner

    with patch("website_profiling.db.property_store.get_property_by_id", return_value=None):
        schedule_runner._spawn_audit_for_property(99, MagicMock())
    assert "not found" in capsys.readouterr().out


def test_schedule_runner_never_writes_pipeline_config() -> None:
    """Regression: cron must not mutate global pipeline_config in PostgreSQL."""
    import inspect

    from website_profiling.tools import schedule_runner

    source = inspect.getsource(schedule_runner)
    assert "write_pipeline_config" not in source


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


def test_module_main_guard(capsys, monkeypatch) -> None:
    import runpy
    import sys

    monkeypatch.setenv("DATABASE_URL", "postgres://u:p@127.0.0.1:5432/test")
    conn = MagicMock()
    cur = MagicMock()
    cur.fetchall.return_value = []
    conn.execute.return_value = cur

    # run_module executes __main__ in a fresh import; drop any prior import from this file.
    sys.modules.pop("website_profiling.tools.schedule_runner", None)

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
