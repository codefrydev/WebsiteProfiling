#!/bin/sh
set -e
cd /app

# Role dispatch. Default "all" runs worker + FastAPI in one container (legacy).
# Split topology: WP_ROLE=fastapi | worker
ROLE="${WP_ROLE:-all}"

require_database_url() {
  if [ -z "${DATABASE_URL:-}" ] || [ -z "$(printf '%s' "$DATABASE_URL" | tr -d '[:space:]')" ]; then
    echo "ERROR: DATABASE_URL is required." >&2
    echo "  Use docker compose (see README) or pass -e DATABASE_URL=postgres://user:pass@host:5432/db" >&2
    exit 1
  fi
}

wait_for_db() {
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
}

migrate() {
  /opt/venv/bin/alembic upgrade head
}

start_uvicorn_foreground() {
  exec /opt/venv/bin/uvicorn website_profiling.api.main:app \
    --host 0.0.0.0 --port 8001 --workers 1
}

case "$ROLE" in
  fastapi)
    require_database_url
    wait_for_db
    migrate
    start_uvicorn_foreground
    ;;
  worker)
    require_database_url
    wait_for_db
    exec /opt/venv/bin/python -m website_profiling.worker
    ;;
  all)
    require_database_url
    wait_for_db
    migrate

    WORKER_PID=""
    UVICORN_PID=""

    cleanup() {
      [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null || true
      [ -n "$UVICORN_PID" ] && kill "$UVICORN_PID" 2>/dev/null || true
    }
    trap cleanup TERM INT

    /opt/venv/bin/python -m website_profiling.worker &
    WORKER_PID=$!

    /opt/venv/bin/uvicorn website_profiling.api.main:app \
      --host 0.0.0.0 --port 8001 --workers 1 &
    UVICORN_PID=$!

    while kill -0 "$UVICORN_PID" 2>/dev/null; do
      sleep 5
    done
    echo "FastAPI exited — shutting down container" >&2
    cleanup
    exit 1
    ;;
  *)
    echo "ERROR: unknown WP_ROLE '$ROLE' (expected: all | fastapi | worker)" >&2
    exit 1
    ;;
esac
