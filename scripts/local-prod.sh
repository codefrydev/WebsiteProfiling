#!/usr/bin/env bash
# Local prod: same Postgres as ./local-run, Next.js build + start (NODE_ENV=production).
# Usage: ./local-prod [command]
#   (default) start   — DB, migrations, npm run build, npm run start
#   build             — npm run build only
#   help              — show commands
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PG_CONTAINER="${WP_PG_CONTAINER:-wp-pg}"
PG_PORT="${WP_PG_PORT:-5432}"
PG_USER="${WP_PG_USER:-postgres}"
PG_PASSWORD="${WP_PG_PASSWORD:-dev}"
PG_DB="${WP_PG_DB:-website_profiling}"

export DATABASE_URL="${DATABASE_URL:-postgres://${PG_USER}:${PG_PASSWORD}@127.0.0.1:${PG_PORT}/${PG_DB}}"
export DATA_DIR="${DATA_DIR:-$ROOT/data}"
export PYTHON="${PYTHON:-$ROOT/.venv/bin/python}"
export WEBSITE_PROFILING_ROOT="$ROOT"
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$ROOT/src"
export NODE_ENV=production

WEB="$ROOT/web"
LOCAL_RUN="$ROOT/scripts/local-run.sh"

log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

cmd_web_deps() {
  need_cmd npm
  if [[ ! -d "$WEB/node_modules" ]]; then
    log "Installing web dependencies (npm ci)"
    (cd "$WEB" && npm ci)
  fi
}

cmd_build() {
  cmd_web_deps
  log "Building Next.js (production)"
  (cd "$WEB" && npm run build)
}

cmd_start() {
  local skip_build=0
  for arg in "$@"; do
    case "$arg" in
      --skip-build) skip_build=1 ;;
    esac
  done

  mkdir -p "$DATA_DIR"
  log "Ensuring Postgres and migrations (via ./local-run migrate)"
  "$LOCAL_RUN" migrate
  if [[ "$skip_build" -eq 0 ]]; then
    cmd_build
  else
    cmd_web_deps
    log "Skipping build (--skip-build)"
  fi
  log "Starting Next.js production server (Ctrl+C to stop)"
  log "DATABASE_URL=$DATABASE_URL"
  log "DATA_DIR=$DATA_DIR"
  log "PYTHON=$PYTHON"
  log "NODE_ENV=$NODE_ENV"
  cd "$ROOT"
  export DATABASE_URL DATA_DIR PYTHON WEBSITE_PROFILING_ROOT PYTHONPATH NODE_ENV

  WORKER_PID=""
  UVICORN_PID=""
  NPM_PID=""

  cleanup_prod() {
    [ -n "$WORKER_PID" ] && kill "$WORKER_PID" 2>/dev/null || true
    [ -n "$UVICORN_PID" ] && kill "$UVICORN_PID" 2>/dev/null || true
    [ -n "$NPM_PID" ] && kill "$NPM_PID" 2>/dev/null || true
  }
  trap cleanup_prod INT TERM EXIT

  log "Starting pipeline worker"
  "$ROOT/.venv/bin/python" -m website_profiling.worker &
  WORKER_PID=$!

  log "Starting FastAPI on port 8001"
  export FASTAPI_URL="http://127.0.0.1:8001"
  "$ROOT/.venv/bin/uvicorn" website_profiling.api.main:app \
    --host 0.0.0.0 --port 8001 --workers 1 &
  UVICORN_PID=$!

  cd "$WEB"
  npm run start -- -H 0.0.0.0 -p 3000 &
  NPM_PID=$!
  wait $NPM_PID
}

cmd_help() {
  cat <<EOF
Local prod runner — same Postgres as ./local-run, Next.js in production mode

  ./local-prod              Same as: start
  ./local-prod start        DB + migrations + build + npm run start
  ./local-prod start --skip-build   Start without rebuilding (reuse .next)
  ./local-prod build        npm run build only
  ./local-prod help         Show this help

Environment overrides (optional):
  DATABASE_URL  (default: postgres://postgres:dev@127.0.0.1:5432/website_profiling)
  DATA_DIR      (default: <repo>/data)
  AUTH_SECRET   (optional — enables login when set)
  WP_PG_CONTAINER, WP_PG_PORT, WP_PG_PASSWORD, WP_PG_DB

After start, open: http://localhost:3000/home
Use localhost (not 127.0.0.1) for pipeline APIs.

Dev mode with hot reload: ./local-run start
EOF
}

main() {
  local cmd="${1:-start}"
  case "$cmd" in
    start)
      shift || true
      cmd_start "$@"
      ;;
    build) cmd_build ;;
    help|-h|--help) cmd_help ;;
    *)
      die "Unknown command: $cmd (try: ./local-prod help)"
      ;;
  esac
}

main "$@"
