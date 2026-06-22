#!/usr/bin/env python3
"""Write web/openapi.json from the FastAPI app (no running server required)."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from fastapi.openapi.utils import get_openapi  # noqa: E402

from website_profiling.api.main import app  # noqa: E402

OUT = ROOT / "web" / "openapi.json"


def main() -> None:
    schema = get_openapi(
        title=app.title,
        version=app.version,
        routes=app.routes,
    )
    OUT.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
