"""Tests for encoding-safe console I/O."""
from __future__ import annotations

import io
import json
import sys

import pytest

from website_profiling.console_io import (
    _write_bytes,
    configure_stdio,
    console_print,
    console_write,
    emit_machine_line,
)
from website_profiling.progress import PREFIX, emit_progress


def test_configure_stdio_idempotent() -> None:
    configure_stdio()
    configure_stdio()


def test_console_write_survives_cp1252_stream() -> None:
    buffer = io.BytesIO()
    stream = io.TextIOWrapper(buffer, encoding="cp1252", errors="strict")
    console_write(stream, "LCP meets good threshold (≤2500ms).")
    output = buffer.getvalue().decode("utf-8", errors="replace")
    assert "2500" in output


def test_console_print_survives_cp1252_stdout(monkeypatch: pytest.MonkeyPatch) -> None:
    buffer = io.BytesIO()
    stream = io.TextIOWrapper(buffer, encoding="cp1252", errors="strict")
    monkeypatch.setattr(sys, "stdout", stream)
    console_print("threshold ≤2500ms")
    output = buffer.getvalue().decode("utf-8", errors="replace")
    assert "2500" in output


def test_emit_machine_line_unicode_url() -> None:
    buffer = io.BytesIO()
    stream = io.TextIOWrapper(buffer, encoding="cp1252", errors="strict")
    old_stdout = sys.stdout
    sys.stdout = stream
    try:
        emit_machine_line(PREFIX, {"phase": "crawl", "step": "fetch", "url": "https://ex.com/café"})
    finally:
        sys.stdout = old_stdout
    raw = buffer.getvalue()
    line = raw.decode("utf-8", errors="replace").strip()
    assert line.startswith(PREFIX)
    payload = json.loads(line[len(PREFIX) :])
    assert payload["url"] == "https://ex.com/café"


def test_emit_progress_prints_json_line(capsys) -> None:
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


def test_configure_stdio_skips_none_stream(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "stdout", None)
    configure_stdio()


def test_configure_stdio_handles_reconfigure_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    class BadStream:
        encoding = "utf-8"

        def reconfigure(self, **_kwargs: object) -> None:
            raise OSError("nope")

    monkeypatch.setattr(sys, "stdout", BadStream())
    monkeypatch.setattr(sys, "stderr", BadStream())
    configure_stdio()


def test_console_write_without_buffer() -> None:
    class FakeStream:
        encoding = "ascii"
        writes: list[str] = []

        def write(self, text: str) -> None:
            self.writes.append(text)

        def flush(self) -> None:
            pass

    stream = FakeStream()
    console_write(stream, "hello")
    assert any("hello" in w for w in stream.writes)


def test_console_write_survives_broken_stream() -> None:
    class BrokenStream:
        encoding = "utf-8"

        def write(self, _text: str) -> None:
            raise OSError("broken")

        def flush(self) -> None:
            raise OSError("broken")

    console_write(BrokenStream(), "safe")


def test_write_bytes_without_buffer() -> None:
    class FakeStream:
        encoding = "ascii"
        writes: list[str] = []

        def write(self, text: str) -> None:
            self.writes.append(text)

        def flush(self) -> None:
            pass

    stream = FakeStream()
    _write_bytes(stream, "hi")
    assert any("hi" in w for w in stream.writes)


def test_emit_machine_line_falls_back_when_buffer_write_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    class BadBuffer:
        def write(self, _data: bytes) -> None:
            raise OSError("fail")

        def flush(self) -> None:
            pass

    class Stream:
        buffer = BadBuffer()
        encoding = "utf-8"
        writes: list[str] = []

        def write(self, text: str) -> None:
            self.writes.append(text)

        def flush(self) -> None:
            pass

    stream = Stream()
    monkeypatch.setattr(sys, "stdout", stream)
    emit_machine_line(PREFIX, {"ok": True})
    assert stream.writes

