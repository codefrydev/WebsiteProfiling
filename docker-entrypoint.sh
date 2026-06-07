#!/bin/sh
set -e
cd /app

if [ -z "${DATABASE_URL:-}" ] || [ -z "$(printf '%s' "$DATABASE_URL" | tr -d '[:space:]')" ]; then
  echo "ERROR: DATABASE_URL is required." >&2
  echo "  Use docker compose (see README) or pass -e DATABASE_URL=postgres://user:pass@host:5432/db" >&2
  exit 1
fi

/opt/venv/bin/python <<'PY'
import os
import sys
import time
from urllib.parse import urlparse

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool


def get_url() -> str:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+psycopg" not in url:
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


def db_host_label() -> str:
    raw = (os.environ.get("DATABASE_URL") or "").strip()
    parsed = urlparse(raw.replace("postgres://", "postgresql://", 1))
    return parsed.hostname or raw


url = get_url()
attempts = 30
delay = 2
last_error = None

for attempt in range(1, attempts + 1):
    try:
        engine = create_engine(url, poolclass=NullPool)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        sys.exit(0)
    except Exception as exc:
        last_error = exc
        if attempt < attempts:
            time.sleep(delay)

host = db_host_label()
print(
    f"ERROR: Could not connect to Postgres at host '{host}' after {attempts * delay}s.",
    file=sys.stderr,
)
print(
    "  Ensure the postgres service is running on the same Docker network (use docker compose).",
    file=sys.stderr,
)
print(f"  Last error: {last_error}", file=sys.stderr)
sys.exit(1)
PY

/opt/venv/bin/alembic upgrade head
cd /app/web && exec npm run start -- -H 0.0.0.0 -p 3000
