"""CLI help command tests."""
from __future__ import annotations

import argparse

import pytest

from website_profiling.commands import help_cmd


def test_help_cmd_delegates_to_aiservice(capsys) -> None:
    with pytest.raises(SystemExit) as exc:
        help_cmd.run({}, argparse.Namespace(stdin_json=False))
    assert exc.value.code == 1
    err = capsys.readouterr().err
    assert "AiService" in err
