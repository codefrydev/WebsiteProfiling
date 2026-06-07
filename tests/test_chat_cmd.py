"""CLI chat command tests."""
from __future__ import annotations

import argparse
import io
import json
from unittest.mock import patch

import pytest

from website_profiling.commands import chat_cmd


def test_chat_cmd_requires_stdin_json() -> None:
    with pytest.raises(SystemExit) as exc:
        chat_cmd.run({}, argparse.Namespace(stdin_json=False))
    assert exc.value.code == 1


def test_chat_cmd_invalid_stdin_json(capsys) -> None:
    with patch("sys.stdin", io.StringIO("not-json")):
        with pytest.raises(SystemExit) as exc:
            chat_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 1
    assert "error" in capsys.readouterr().out


def test_chat_cmd_success(capsys) -> None:
    payload = json.dumps({"messages": [{"role": "user", "content": "Hi"}], "property_id": 1})
    with patch("sys.stdin", io.StringIO(payload)):
        with patch(
            "website_profiling.commands.chat_cmd.run_agent_turn",
            return_value={"ok": True, "message": "Done"},
        ) as mock_turn:
            with pytest.raises(SystemExit) as exc:
                chat_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 0
    mock_turn.assert_called_once()
    assert mock_turn.call_args[0][1].property_id == 1


def test_chat_cmd_streams_sanitized_events(capsys) -> None:
    payload = json.dumps({"messages": [{"role": "user", "content": "Hi"}]})

    def fake_turn(_messages, _ctx, on_event=None):
        if on_event:
            on_event({"type": "token", "content": "bad\udc9d"})
        return {"ok": True}

    with patch("sys.stdin", io.StringIO(payload)):
        with patch("website_profiling.commands.chat_cmd.run_agent_turn", side_effect=fake_turn):
            with pytest.raises(SystemExit) as exc:
                chat_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 0
    out = capsys.readouterr().out
    assert "\udc9d" not in out
    assert "token" in out


def test_chat_cmd_coerces_invalid_ids_and_messages(capsys) -> None:
    payload = json.dumps({"messages": "bad", "property_id": "x", "report_id": "y"})
    with patch("sys.stdin", io.StringIO(payload)):
        with patch(
            "website_profiling.commands.chat_cmd.run_agent_turn",
            return_value={"ok": True},
        ) as mock_turn:
            with pytest.raises(SystemExit) as exc:
                chat_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 0
    ctx = mock_turn.call_args[0][1]
    assert ctx.property_id is None
    assert ctx.report_id is None
    assert mock_turn.call_args[0][0] == []


def test_chat_cmd_agent_failure(capsys) -> None:
    payload = json.dumps({"messages": []})
    with patch("sys.stdin", io.StringIO(payload)):
        with patch(
            "website_profiling.commands.chat_cmd.run_agent_turn",
            return_value={"ok": False, "error": "LLM disabled"},
        ):
            with pytest.raises(SystemExit) as exc:
                chat_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 1
    assert "LLM disabled" in capsys.readouterr().out


def test_chat_cmd_exception(capsys) -> None:
    payload = json.dumps({"messages": []})
    with patch("sys.stdin", io.StringIO(payload)):
        with patch(
            "website_profiling.commands.chat_cmd.run_agent_turn",
            side_effect=RuntimeError("boom"),
        ):
            with pytest.raises(SystemExit) as exc:
                chat_cmd.run({}, argparse.Namespace(stdin_json=True))
    assert exc.value.code == 1
    assert "boom" in capsys.readouterr().out
