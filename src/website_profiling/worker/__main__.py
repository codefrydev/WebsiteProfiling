"""Entry point: python -m website_profiling.worker"""
from __future__ import annotations

from .loop import run_worker_loop

if __name__ == "__main__":
    run_worker_loop()
