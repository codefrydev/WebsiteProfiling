"""Safe stdout/stderr for CLI and pipeline jobs (Windows cp1252-safe)."""
from __future__ import annotations

import json
import sys
from typing import Any, TextIO


def configure_stdio() -> None:
    """Best-effort UTF-8 stdout/stderr; never raises."""
    for stream in (sys.stdout, sys.stderr):
        if stream is None:
            continue
        if hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8", errors="replace")
            except Exception:
                pass


def _write_bytes(stream: TextIO, text: str, *, end: str = "\n") -> None:
    payload = text + end
    buffer = getattr(stream, "buffer", None)
    if buffer is not None:
        buffer.write(payload.encode("utf-8", errors="replace"))
        buffer.flush()
        return
    enc = getattr(stream, "encoding", None) or "utf-8"
    stream.write(payload.encode(enc, errors="replace").decode(enc, errors="replace"))
    stream.flush()


def console_write(stream: TextIO, text: str, *, end: str = "\n") -> None:
    """Write human-readable text; never raises UnicodeEncodeError."""
    try:
        stream.write(text + end)
        stream.flush()
    except UnicodeEncodeError:
        _write_bytes(stream, text, end=end)
    except Exception:
        try:
            _write_bytes(stream, text, end=end)
        except Exception:
            pass


def console_print(*args: Any, file: TextIO | None = None, **kwargs: Any) -> None:
    """Print human-readable text; never raises UnicodeEncodeError."""
    stream = file if file is not None else sys.stdout
    end = kwargs.get("end", "\n")
    sep = kwargs.get("sep", " ")
    text = sep.join(str(a) for a in args)
    console_write(stream, text, end=end)


def emit_machine_line(prefix: str, payload: dict[str, Any]) -> None:
    """Emit a machine-readable stdout line (e.g. @progress JSON); never raises."""
    line = prefix + json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"
    buffer = getattr(sys.stdout, "buffer", None)
    if buffer is not None:
        try:
            buffer.write(line.encode("utf-8", errors="replace"))
            buffer.flush()
            return
        except Exception:
            pass
    console_write(sys.stdout, line.rstrip("\n"), end="\n")
