"""Example config files should stay aligned with each other."""
from __future__ import annotations

from pathlib import Path

from tests.config_test_utils import REPO_ROOT, parse_config_keys


def test_input_and_pipeline_example_have_same_keys():
    input_keys = parse_config_keys(REPO_ROOT / "input.txt.example")
    pipeline_keys = parse_config_keys(REPO_ROOT / "pipeline-config.example.txt")
    assert input_keys == pipeline_keys, (
        f"input.txt.example and pipeline-config.example.txt differ: "
        f"only in input={sorted(input_keys - pipeline_keys)} "
        f"only in pipeline={sorted(pipeline_keys - input_keys)}"
    )


def test_example_configs_have_no_legacy_google_credentials_path():
    keys = parse_config_keys(REPO_ROOT / "input.txt.example")
    assert "google_credentials_path" not in keys
