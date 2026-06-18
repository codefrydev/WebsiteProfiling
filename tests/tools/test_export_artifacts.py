"""Tests for export artifact store."""
from __future__ import annotations

import json
import os
import time

import pytest

from website_profiling.tools import export_artifacts


@pytest.fixture
def artifact_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    return tmp_path


def test_save_and_read_artifact(artifact_dir) -> None:
    env = export_artifacts.save_artifact(b"hello", filename="test.txt", mime_type="text/plain")
    assert env["artifact_id"]
    assert env["size_bytes"] == 5
    assert env["download_path"].startswith("/api/chat/artifacts/")
    loaded = export_artifacts.read_artifact_bytes(env["artifact_id"])
    assert loaded is not None
    meta, data = loaded
    assert meta["filename"] == "test.txt"
    assert data == b"hello"


def test_inline_content_for_small_text(artifact_dir) -> None:
    env = export_artifacts.save_artifact("a,b\n1,2", filename="t.csv", mime_type="text/csv")
    assert env.get("content") == "a,b\n1,2"


def test_read_missing_artifact(artifact_dir) -> None:
    assert export_artifacts.read_artifact_bytes("00000000-0000-0000-0000-000000000000") is None


def test_dicts_to_csv() -> None:
    csv_text = export_artifacts.dicts_to_csv(
        [{"url": "https://ex.com", "status": "404"}],
        columns=["url", "status"],
    )
    assert "url,status" in csv_text
    assert "https://ex.com" in csv_text


    env = export_artifacts.save_artifact(b"x", filename="old.bin", mime_type="application/octet-stream")
    meta_path = os.path.join(export_artifacts.exports_dir(), f"{env['artifact_id']}.meta.json")
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    meta["created_at_epoch"] = time.time() - export_artifacts._TTL_SECONDS - 10
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f)
    removed = export_artifacts.sweep_expired_artifacts()
    assert removed >= 1
    assert export_artifacts.read_artifact_bytes(env["artifact_id"]) is None
