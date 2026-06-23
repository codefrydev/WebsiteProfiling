"""Cancel and pause signal helpers for the pipeline worker."""
from __future__ import annotations

import os
import subprocess
import sys
import tempfile


def cancel_subprocess(proc: subprocess.Popen) -> None:  # type: ignore[type-arg]
    """Kill a subprocess as hard as possible."""
    try:
        proc.kill()
    except ProcessLookupError:
        pass


def pause_subprocess(proc: subprocess.Popen) -> None:  # type: ignore[type-arg]
    """Send SIGUSR1 on Unix or write a pause-flag file on Windows."""
    if sys.platform == "win32":
        # Windows: write a flag file the Python worker checks.
        flag = os.path.join(tempfile.gettempdir(), f"wp_pause_{proc.pid}.flag")
        try:
            with open(flag, "w") as f:
                f.write("pause")
        except OSError:
            pass
    else:
        import signal

        try:
            os.kill(proc.pid, signal.SIGUSR1)
        except ProcessLookupError:
            pass
