"""CLI help command tests."""
from __future__ import annotations

import argparse
import io
import json
from unittest.mock import patch

import pytest

from website_profiling.commands import help_cmd


def test_help_cmd_requires_stdin_json() -> None:
    with pytest.raises(SystemExit) as exc:
        help_cmd.run({}, argparse.Namespace(stdin_json=False))
    assert exc.value.code == 1


def test_help_cmd_invalid_stdin_json(capsys) -> None:
    with patch("sys.stdin", io.StringIO("not-json")):
        with pytest.raises(SystemExit) as exc:
            help_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 1
    assert "error" in capsys.readouterr().out


def test_help_cmd_success(capsys) -> None:
    payload = json.dumps({"messages": [{"role": "user", "content": "How do I set up Google?"}]})
    with patch("sys.stdin", io.StringIO(payload)):
        with patch(
            "website_profiling.commands.help_cmd.run_help_turn",
            return_value={"ok": True},
        ) as mock_turn:
            with pytest.raises(SystemExit) as exc:
                help_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 0
    mock_turn.assert_called_once()
    # Confirm no property_id is passed (no AuditToolContext)
    call_args = mock_turn.call_args
    assert call_args[0][0] == [{"role": "user", "content": "How do I set up Google?"}]


def test_help_cmd_no_property_id_in_payload(capsys) -> None:
    """Help command must not pass property_id or any audit context."""
    payload = json.dumps({"messages": [], "property_id": 99})
    with patch("sys.stdin", io.StringIO(payload)):
        with patch(
            "website_profiling.commands.help_cmd.run_help_turn",
            return_value={"ok": True},
        ) as mock_turn:
            with pytest.raises(SystemExit):
                help_cmd.run({}, argparse.Namespace(stdin_json=True))
    # run_help_turn is called with only (messages,) positional arg, no context
    call_args = mock_turn.call_args
    assert len(call_args[0]) == 1  # only messages positional arg


def test_help_cmd_streams_token_events(capsys) -> None:
    payload = json.dumps({"messages": [{"role": "user", "content": "help"}]})

    def fake_turn(_messages, on_event=None):
        if on_event:
            on_event({"type": "token", "text": "Hello!"})
        return {"ok": True}

    with patch("sys.stdin", io.StringIO(payload)):
        with patch("website_profiling.commands.help_cmd.run_help_turn", side_effect=fake_turn):
            with pytest.raises(SystemExit) as exc:
                help_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "token" in out
    assert "Hello!" in out


def test_help_cmd_agent_failure(capsys) -> None:
    payload = json.dumps({"messages": []})
    with patch("sys.stdin", io.StringIO(payload)):
        with patch(
            "website_profiling.commands.help_cmd.run_help_turn",
            return_value={"ok": False, "error": "AI disabled"},
        ):
            with pytest.raises(SystemExit) as exc:
                help_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 1
    assert "AI disabled" in capsys.readouterr().out


def test_help_cmd_exception(capsys) -> None:
    payload = json.dumps({"messages": []})
    with patch("sys.stdin", io.StringIO(payload)):
        with patch(
            "website_profiling.commands.help_cmd.run_help_turn",
            side_effect=RuntimeError("boom"),
        ):
            with pytest.raises(SystemExit) as exc:
                help_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 1
    assert "boom" in capsys.readouterr().out


def test_help_cmd_sanitizes_events(capsys) -> None:
    payload = json.dumps({"messages": []})

    def fake_turn(_messages, on_event=None):
        if on_event:
            on_event({"type": "token", "text": "bad\udc9d"})
        return {"ok": True}

    with patch("sys.stdin", io.StringIO(payload)):
        with patch("website_profiling.commands.help_cmd.run_help_turn", side_effect=fake_turn):
            with pytest.raises(SystemExit) as exc:
                help_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "\udc9d" not in out
    assert "token" in out


def test_help_cmd_ignores_invalid_messages(capsys) -> None:
    payload = json.dumps({"messages": "not-a-list"})
    with patch("sys.stdin", io.StringIO(payload)):
        with patch(
            "website_profiling.commands.help_cmd.run_help_turn",
            return_value={"ok": True},
        ) as mock_turn:
            with pytest.raises(SystemExit) as exc:
                help_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 0
    assert mock_turn.call_args[0][0] == []
