#!/usr/bin/env bash
# Local dev: PostgreSQL in Docker (wp-pg), Python venv + Next.js on the host.
# Usage: ./local-run [command]
#   (default) start   — ensure DB, migrations, npm run dev
#   setup           — DB + venv + deps + migrations (no web server)
#   db              — start Postgres container only
#   migrate         — alembic upgrade head
#   stop            — stop wp-pg container
#   help            — show commands
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_CONTAINER="${WP_PG_CONTAINER:-wp-pg}"
PG_IMAGE="${WP_PG_IMAGE:-postgres:16-alpine}"
PG_PORT="${WP_PG_PORT:-5432}"
PG_USER="${WP_PG_USER:-postgres}"
PG_PASSWORD="${WP_PG_PASSWORD:-dev}"
PG_DB="${WP_PG_DB:-website_profiling}"

export DATABASE_URL="${DATABASE_URL:-postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}}"
export DATA_DIR="${DATA_DIR:-$ROOT/data}"
export PYTHON="${PYTHON:-$ROOT/.venv/bin/python}"
export WEBSITE_PROFILING_ROOT="$ROOT"
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$ROOT/src"

VENV="$ROOT/.venv"
WEB="$ROOT/web"

log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ensure_docker() {
  need_cmd docker
  if ! docker info >/dev/null 2>&1; then
    die "Docker is not running. Start Docker Desktop, then retry."
  fi
}

wait_for_postgres() {
  local i
  for i in $(seq 1 30); do
    if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  die "Postgres did not become ready in time (container: $PG_CONTAINER)"
}

cmd_db() {
  ensure_docker
  if docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
      log "Postgres already running ($PG_CONTAINER)"
    else
      log "Starting existing container $PG_CONTAINER"
      docker start "$PG_CONTAINER" >/dev/null
    fi
  else
    log "Creating Postgres container $PG_CONTAINER on port $PG_PORT"
    docker run -d --name "$PG_CONTAINER" \
      -e "POSTGRES_PASSWORD=$PG_PASSWORD" \
      -e "POSTGRES_DB=$PG_DB" \
      -p "${PG_PORT}:5432" \
      "$PG_IMAGE" >/dev/null
  fi
  wait_for_postgres
  log "DATABASE_URL=$DATABASE_URL"
}

cmd_venv() {
  need_cmd python3
  if [[ ! -x "$VENV/bin/python" ]]; then
    log "Creating Python venv at .venv"
    python3 -m venv "$VENV"
  fi
  log "Installing Python dependencies"
  "$VENV/bin/pip" install -q -r "$ROOT/requirements.txt"
}

cmd_migrate() {
  cmd_db
  [[ -x "$VENV/bin/alembic" ]] || cmd_venv
  log "Applying database migrations (alembic upgrade head)"
  "$VENV/bin/alembic" upgrade head
}

cmd_web_deps() {
  need_cmd npm
  if [[ ! -d "$WEB/node_modules" ]]; then
    log "Installing web dependencies (npm ci)"
    (cd "$WEB" && npm ci)
  fi
}

cmd_browser_deps() {
  [[ -x "$VENV/bin/python" ]] || cmd_venv
  log "Ensuring Playwright + Chromium for JS crawl"
  if ! "$VENV/bin/python" -c "
from website_profiling.crawl.fetchers import ensure_browser_deps
import json, sys
status = ensure_browser_deps()
print(json.dumps(status))
sys.exit(0 if status.get('ok') else 1)
"; then
    warn "Browser deps unavailable — JS/auto crawl disabled until Playwright + Chromium install successfully"
  fi
}

cmd_setup() {
  mkdir -p "$DATA_DIR"
  cmd_db
  cmd_venv
  cmd_browser_deps
  cmd_migrate
  cmd_web_deps
  log "Setup complete."
  log "Start the UI: ./local-run start"
  log "Open http://localhost:3000/home (use localhost, not 127.0.0.1 for pipeline APIs)"
}

cmd_start() {
  mkdir -p "$DATA_DIR"
  cmd_db
  [[ -x "$VENV/bin/alembic" ]] || cmd_venv
  cmd_browser_deps
  log "Ensuring migrations are up to date"
  "$VENV/bin/alembic" upgrade head
  cmd_web_deps
  cd "$ROOT"
  export DATABASE_URL DATA_DIR PYTHON WEBSITE_PROFILING_ROOT PYTHONPATH

  WORKER_PID=""
  UVICORN_PID=""

  cleanup_local() {
    [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null || true
    [ -n "$UVICORN_PID" ] && kill "$UVICORN_PID" 2>/dev/null || true
  }
  trap cleanup_local INT TERM EXIT

  log "Starting pipeline worker"
  "$VENV/bin/python" -m website_profiling.worker &
  WORKER_PID=$!

  log "Starting FastAPI on port 8001"
  export FASTAPI_URL="http://127.0.0.1:8001"
  export FASTAPI_ALLOWED_ORIGINS="http://localhost:3000"
  "$VENV/bin/uvicorn" website_profiling.api.main:app \
    --host 0.0.0.0 --port 8001 --workers 1 &
  UVICORN_PID=$!

  log "Starting Next.js dev server (Ctrl+C to stop)"
  log "DATABASE_URL=$DATABASE_URL"
  log "DATA_DIR=$DATA_DIR"
  log "PYTHON=$PYTHON"
  cd "$WEB"
  exec npm run dev
}

cmd_stop() {
  ensure_docker
  if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    log "Stopping $PG_CONTAINER"
    docker stop "$PG_CONTAINER" >/dev/null
  else
    warn "Container $PG_CONTAINER is not running"
  fi
}

cmd_help() {
  cat <<EOF
Local dev runner — Postgres in Docker, app on your machine

  ./local-run              Same as: start
  ./local-run start        DB + migrations + npm run dev
  ./local-run setup        One-time setup (no dev server)
  ./local-run db           Start Postgres only
  ./local-run migrate      Run alembic upgrade head
  ./local-run stop         Stop Postgres container

Environment overrides (optional):
  DATABASE_URL  (default: postgres://postgres:dev@127.0.0.1:5432/website_profiling)
  DATA_DIR      (default: <repo>/data)
  WP_PG_CONTAINER, WP_PG_PORT, WP_PG_PASSWORD, WP_PG_DB

After start, open: http://localhost:3000/home
Run audits via sidebar "Run audit" (bottom-right FAB).

Production Next.js (same Postgres, no hot reload): ./local-prod start

Run CI-style tests: ./local-test (see ./local-test help). JS crawl integration: ./local-test browser.
EOF
}

main() {
  local cmd="${1:-start}"
  case "$cmd" in
    start) cmd_start ;;
    setup) cmd_setup ;;
    db) cmd_db ;;
    migrate) cmd_migrate ;;
    stop) cmd_stop ;;
    help|-h|--help) cmd_help ;;
    *)
      die "Unknown command: $cmd (try: ./local-run help)"
      ;;
  esac
}

main "$@"
