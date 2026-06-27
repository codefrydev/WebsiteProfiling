"""Unit tests for Lighthouse runner mode dispatch and on-pages stats."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


def test_run_lighthouse_once_flow_mode_uses_node_script() -> None:
    from website_profiling.lighthouse import runner as lh_runner

    proc = MagicMock(returncode=0, stdout="", stderr="")
    with patch.object(lh_runner, "run_lighthouse_flow_once", return_value=proc) as mock_flow:
        out = lh_runner.run_lighthouse_once(
            "https://example.com",
            "mobile",
            "/tmp/out.json",
            mode="snapshot",
            wait_ms=2000,
        )
    assert out is proc
    mock_flow.assert_called_once()
    assert mock_flow.call_args.kwargs["wait_ms"] == 2000


def test_run_lighthouse_once_navigation_uses_cli() -> None:
    from website_profiling.lighthouse import runner as lh_runner

    proc = MagicMock(returncode=0, stdout="", stderr="")
    with patch.object(lh_runner, "_lighthouse_cmd", return_value=["lighthouse"]):
        with patch.object(lh_runner.subprocess, "run", return_value=proc) as mock_run:
            out = lh_runner.run_lighthouse_once(
                "https://example.com",
                "mobile",
                "/tmp/out.json",
                mode="navigation",
                categories=["performance", "seo", "pwa"],
            )
    assert out is proc
    cmd = mock_run.call_args[0][0]
    assert cmd[0] == "lighthouse"
    assert "--only-categories=performance,seo" in cmd
    assert "pwa" not in " ".join(cmd)


def test_categories_for_cli_strips_pwa() -> None:
    from website_profiling.lighthouse.runner import _categories_for_cli, _parse_categories

    assert _categories_for_cli(_parse_categories("performance,pwa,seo")) == ["performance", "seo"]
    assert _categories_for_cli(_parse_categories("pwa")) is None


def test_normalize_lighthouse_mode_rejects_unknown() -> None:
    from website_profiling.lighthouse import runner as lh_runner

    with pytest.raises(RuntimeError, match="Invalid lighthouse_mode"):
        lh_runner._normalize_lighthouse_mode("bogus")


def test_run_lighthouse_on_pages_returns_stats(monkeypatch, tmp_path) -> None:
    from website_profiling.lighthouse import runner as lh_runner

    monkeypatch.setattr(lh_runner, "is_lighthouse_available", lambda: True)
    monkeypatch.setattr(
        lh_runner,
        "run_lighthouse_audit",
        lambda **_k: {"raw_reports": []},
    )

    class Ctx:
        def __enter__(self):
            return MagicMock()

        def __exit__(self, *_):
            return False

    monkeypatch.setattr("website_profiling.db.db_session", lambda: Ctx())
    monkeypatch.setattr(
        "website_profiling.db.write_lighthouse_page_summary",
        lambda *_a, **_k: None,
    )
    monkeypatch.setattr("website_profiling.db.write_lighthouse_run", lambda *_a, **_k: 1)
    monkeypatch.setattr(
        "website_profiling.db.write_lh_audits_from_run",
        lambda *_a, **_k: None,
    )

    stats = lh_runner.run_lighthouse_on_pages(
        ["https://a.com"],
        output_dir=str(tmp_path),
        concurrency=1,
    )
    assert stats == {"attempted": 1, "succeeded": 1, "failed": 0}


def test_run_lighthouse_on_pages_counts_failures(monkeypatch, tmp_path) -> None:
    from website_profiling.lighthouse import runner as lh_runner

    monkeypatch.setattr(lh_runner, "is_lighthouse_available", lambda: True)

    def boom(**_k):
        raise RuntimeError("audit failed")

    monkeypatch.setattr(lh_runner, "run_lighthouse_audit", boom)

    stats = lh_runner.run_lighthouse_on_pages(
        ["https://a.com"],
        output_dir=str(tmp_path),
        concurrency=1,
    )
    assert stats == {"attempted": 1, "succeeded": 0, "failed": 1}


def test_run_lighthouse_on_pages_empty_urls() -> None:
    from website_profiling.lighthouse import runner as lh_runner

    assert lh_runner.run_lighthouse_on_pages([]) == {
        "attempted": 0,
        "succeeded": 0,
        "failed": 0,
    }
