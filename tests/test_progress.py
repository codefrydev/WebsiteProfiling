"""Tests for structured pipeline progress events."""
from __future__ import annotations

import json
from unittest.mock import patch

from website_profiling.progress import CrawlProgressTracker, PREFIX, emit_progress, emit_phase_done


def test_emit_progress_prints_json_line(capsys):
    emit_progress("crawl", "fetch", current=3, total=10, url="https://ex.com/a")
    out = capsys.readouterr().out.strip()
    assert out.startswith(PREFIX)
    payload = json.loads(out[len(PREFIX) :])
    assert payload["phase"] == "crawl"
    assert payload["step"] == "fetch"
    assert payload["current"] == 3
    assert payload["total"] == 10
    assert payload["url"] == "https://ex.com/a"
    assert "ts" in payload


def test_crawl_tracker_throttles(capsys):
    tracker = CrawlProgressTracker(total=100, start_time=1000.0)
    with patch("website_profiling.progress.time") as mock_time:
        # Each emit calls time() twice (tracker + payload ts).
        mock_time.time.side_effect = [
            1000.0, 1000.0,
            1000.5,
            1000.6,
            1003.0, 1003.0,
            1008.0, 1008.0,
        ]
        tracker.maybe_emit(1, "https://a.com")
        tracker.maybe_emit(2, "https://b.com")
        tracker.maybe_emit(3, "https://c.com")
        tracker.maybe_emit(6, "https://f.com")
    lines = [ln for ln in capsys.readouterr().out.splitlines() if ln.startswith(PREFIX)]
    assert len(lines) == 2
    last = json.loads(lines[-1][len(PREFIX) :])
    assert last["current"] == 6


def test_emit_phase_done():
    with patch("website_profiling.progress.print") as mock_print:
        emit_phase_done("report")
        args = mock_print.call_args[0][0]
        assert args.startswith(PREFIX)
        payload = json.loads(args[len(PREFIX) :])
        assert payload["phase"] == "report"
        assert payload["step"] == "done"


def test_crawl_tracker_finish_natural_stop(capsys):
    tracker = CrawlProgressTracker(total=1500, limit=1500, start_time=1000.0)
    tracker.finish(1138)
    lines = [ln for ln in capsys.readouterr().out.splitlines() if ln.startswith(PREFIX)]
    assert len(lines) == 1
    payload = json.loads(lines[0][len(PREFIX) :])
    assert payload["current"] == 1138
    assert payload["total"] == 1138
    assert payload["limit"] == 1500


def test_crawl_tracker_finish_at_limit(capsys):
    tracker = CrawlProgressTracker(total=1500, limit=1500, start_time=1000.0)
    tracker.finish(1500)
    lines = [ln for ln in capsys.readouterr().out.splitlines() if ln.startswith(PREFIX)]
    payload = json.loads(lines[-1][len(PREFIX) :])
    assert payload["current"] == 1500
    assert payload["total"] == 1500
    assert payload["limit"] == 1500
