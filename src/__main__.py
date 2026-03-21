"""Entry: ``python -m src`` from repo root (adds ``src/`` to path, then runs the app)."""
from __future__ import annotations

import sys
from pathlib import Path

_root = Path(__file__).resolve().parent
if str(_root) not in sys.path:
    sys.path.insert(0, str(_root))

from website_profiling.cli import main

if __name__ == "__main__":
    main()
