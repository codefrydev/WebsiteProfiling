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

WORKER_PID=""
UVICORN_PID=""
NPM_PID=""

cleanup() {
  [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null || true
  [ -n "$UVICORN_PID" ] && kill "$UVICORN_PID" 2>/dev/null || true
  [ -n "$NPM_PID" ] && kill "$NPM_PID" 2>/dev/null || true
}
trap cleanup TERM INT

/opt/venv/bin/python -m website_profiling.worker &
WORKER_PID=$!

/opt/venv/bin/uvicorn website_profiling.api.main:app \
  --host 0.0.0.0 --port 8001 --workers 1 &
UVICORN_PID=$!

# Wait for FastAPI to be ready before starting Next.js (max ~15s)
i=0
while [ "$i" -lt 30 ]; do
  if node -e "require('http').get('http://127.0.0.1:8001/api/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))" 2>/dev/null; then
    echo "FastAPI ready (attempt $((i + 1))/30)" >&2
    break
  fi
  sleep 0.5
  i=$((i + 1))
done
if [ "$i" -eq 30 ]; then
  echo "WARNING: FastAPI did not respond to /api/health after 15s — continuing anyway" >&2
fi

cd /app/web
npm run start -- -H 0.0.0.0 -p 3000 &
NPM_PID=$!

# Monitor critical processes — exit the container if either npm or uvicorn dies.
# A dead worker does not break the UI so it is intentionally excluded.
while kill -0 "$NPM_PID" 2>/dev/null && kill -0 "$UVICORN_PID" 2>/dev/null; do
  sleep 5
done
echo "Critical process (npm or uvicorn) exited — shutting down container" >&2
cleanup
exit 1
