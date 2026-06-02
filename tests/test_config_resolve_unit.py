import argparse
import os

import pytest
from pathlib import Path


def test_cleanup_lighthouse_work_dir_only_deletes_under_tmp(tmp_path, monkeypatch) -> None:
    from website_profiling.commands.config_resolve import cleanup_lighthouse_work_dir

    # Under tmp -> removed
    d = tmp_path / "wp-lighthouse-x"
    d.mkdir()
    cleanup_lighthouse_work_dir(str(d))
    assert not d.exists()

    # Outside tmp -> should not remove
    outside = Path.cwd() / "outside-wp-test"
    outside.mkdir(exist_ok=True)
    try:
        cleanup_lighthouse_work_dir(str(outside))
        assert outside.exists()
    finally:
        # cleanup in case it wasn't removed
        if outside.exists():
            outside.rmdir()


def test_require_start_url_exits_when_missing(capsys) -> None:
    from website_profiling.commands.config_resolve import require_start_url

    with pytest.raises(SystemExit) as e:
        require_start_url({}, for_step="crawl")
    assert e.value.code == 1
    assert "start_url is required" in capsys.readouterr().err

