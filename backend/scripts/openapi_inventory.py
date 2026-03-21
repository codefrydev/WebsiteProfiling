#!/usr/bin/env python3
"""Print a checklist of all OpenAPI paths and methods (run from repo root or backend/)."""
import json
import os
import sys

# Ensure backend package is importable
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

from app.main import app  # noqa: E402


def main() -> None:
    spec = app.openapi()
    paths = spec.get("paths") or {}
    lines = [f"# API route inventory ({len(paths)} paths)", ""]
    for path in sorted(paths.keys()):
        item = paths[path]
        methods = [m.upper() for m in ("get", "post", "put", "patch", "delete") if m in item]
        lines.append(f"## `{path}`")
        for m in sorted(methods):
            op = item.get(m.lower(), {})
            summary = op.get("summary") or op.get("operationId") or ""
            lines.append(f"- **{m}** {summary}")
        lines.append("")
    out = "\n".join(lines)
    print(out)
    out_path = os.path.join(ROOT, "openapi_routes.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(out)
    print(f"Wrote {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
