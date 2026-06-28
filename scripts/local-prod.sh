#!/usr/bin/env bash
# Local prod: same Postgres as ./local-run, full stack + Vite build + preview (NODE_ENV=production).
# Usage: ./local-prod [command]
#   (default) start   — DB, migrations, .NET stack, worker, FastAPI, vite preview
#   build             — npm run build only
#   help              — show commands
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
# shellcheck source=scripts/local-run-common.sh
source "$ROOT/scripts/local-run-common.sh"

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
export VITE_BFF_BASE_URL="${VITE_BFF_BASE_URL:-http://localhost:8090}"
export DEPRECATE_PYTHON_INTEGRATIONS="${DEPRECATE_PYTHON_INTEGRATIONS:-1}"
export USE_FASTAPI_PYTHON_BRIDGE="${USE_FASTAPI_PYTHON_BRIDGE:-1}"

WEB="$ROOT/web"
LOCAL_RUN="$ROOT/scripts/local-run.sh"

log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

kill_process_tree() {
  local pid="$1"
  local sig="${2:-TERM}"
  local child
  [[ -z "$pid" ]] && return 0
  for child in $(pgrep -P "$pid" 2>/dev/null || true); do
    kill_process_tree "$child" "$sig"
  done
  kill "-$sig" "$pid" 2>/dev/null || true
}

wait_for_pid() {
  local pid="$1"
  local timeout="${2:-10}"
  local i
  [[ -z "$pid" ]] && return 0
  for ((i = 0; i < timeout * 2; i++)); do
    kill -0 "$pid" 2>/dev/null || return 0
    sleep 0.5
  done
  return 1
}

stop_service() {
  local name="$1"
  local pid="$2"
  local port="${3:-}"
  [[ -z "$pid" ]] && return 0
  if ! kill -0 "$pid" 2>/dev/null; then
    wait "$pid" 2>/dev/null || true
    log "$name already stopped."
    [[ -n "$port" ]] && free_port "$port"
    return 0
  fi
  log "Stopping $name (PID $pid)..."
  kill_process_tree "$pid" TERM
  if ! wait_for_pid "$pid" 10; then
    warn "$name did not exit in time — sending SIGKILL"
    kill_process_tree "$pid" KILL
    wait_for_pid "$pid" 2 || true
  fi
  wait "$pid" 2>/dev/null || true
  log "$name stopped."
  [[ -n "$port" ]] && free_port "$port"
}

disown_bg() {
  local pid="$1"
  [[ -z "$pid" ]] && return 0
  disown "$pid" 2>/dev/null || true
}

stop_postgres() {
  if ! command -v docker >/dev/null 2>&1; then
    return 0
  fi
  if ! docker info >/dev/null 2>&1; then
    warn "Docker unavailable — skipping Postgres stop"
    return 0
  fi
  if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx "$PG_CONTAINER"; then
    log "Stopping $PG_CONTAINER"
    docker stop "$PG_CONTAINER" >/dev/null 2>&1 || warn "Could not stop $PG_CONTAINER"
    log "Postgres stopped."
  fi
}

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
  log "Building Vite SPA (production, VITE_BFF_BASE_URL=$VITE_BFF_BASE_URL)"
  (cd "$WEB" && VITE_BFF_BASE_URL="$VITE_BFF_BASE_URL" npm run build)
}

cmd_start() {
  local skip_build=0
  for arg in "$@"; do
    case "$arg" in
      --skip-build) skip_build=1 ;;
    esac
  done

  need_cmd dotnet

  mkdir -p "$DATA_DIR"
  log "Ensuring Postgres and migrations (via ./local-run migrate)"
  "$LOCAL_RUN" migrate
  if [[ "$skip_build" -eq 0 ]]; then
    cmd_build
  else
    cmd_web_deps
    log "Skipping build (--skip-build)"
  fi
  log "Starting local prod stack (Ctrl+C stops all services including Postgres)"
  log "DATABASE_URL=$DATABASE_URL"
  log "DATA_DIR=$DATA_DIR"
  log "VITE_BFF_BASE_URL=$VITE_BFF_BASE_URL"
  log "INTEGRATIONS_SERVICE_URL=${INTEGRATIONS_SERVICE_URL:-http://127.0.0.1:8093}"
  cd "$ROOT"
  export DATABASE_URL DATA_DIR PYTHON WEBSITE_PROFILING_ROOT PYTHONPATH NODE_ENV
  export VITE_BFF_BASE_URL DEPRECATE_PYTHON_INTEGRATIONS USE_FASTAPI_PYTHON_BRIDGE

  WORKER_PID=""
  UVICORN_PID=""
  NPM_PID=""
  _CLEANUP_DONE=0
  set +m

  cleanup_prod() {
    if [[ "$_CLEANUP_DONE" -eq 1 ]]; then
      return 0
    fi
    _CLEANUP_DONE=1
    trap - INT TERM EXIT
    set +e

    log "Shutting down local prod stack..."
    stop_service "Vite preview" "$NPM_PID"
    NPM_PID=""
    stop_host_dotnet_stack stop_service
    stop_service "FastAPI" "$UVICORN_PID" 8096
    UVICORN_PID=""
    stop_service "pipeline worker" "$WORKER_PID"
    WORKER_PID=""
    stop_postgres
    log "All services stopped."
    exit 0
  }
  trap cleanup_prod EXIT INT TERM

  start_host_dotnet_base "$ROOT" Production
  start_host_report_service "$ROOT" Production
  disown_bg "$FILE_SERVICE_PID"
  disown_bg "$DATA_PID"
  disown_bg "$AI_PID"
  disown_bg "$REPORT_PID"

  export AI_SERVICE_URL="${AI_SERVICE_URL:-http://127.0.0.1:8092}"
  export INTEGRATIONS_SERVICE_URL="${INTEGRATIONS_SERVICE_URL:-http://127.0.0.1:8093}"
  export FILE_SERVICE_URL="${FILE_SERVICE_URL:-http://127.0.0.1:8080}"
  export REPORT_SERVICE_URL="${REPORT_SERVICE_URL:-http://127.0.0.1:8094}"
  export PIPELINE_ORCHESTRATE_VIA_REPORT_SERVICE="${PIPELINE_ORCHESTRATE_VIA_REPORT_SERVICE:-1}"
  export PYTHON="${PYTHON:-$ROOT/.venv/bin/python}"
  export WEBSITE_PROFILING_ROOT="$ROOT"

  log "Pipeline jobs run in ReportService C# worker"
  log "Starting Python bridge (audit-tool + keyword enrich CLI) on port 8096"
  export FASTAPI_URL="http://127.0.0.1:8096"
  export FASTAPI_ALLOWED_ORIGINS="http://localhost:8090"
  "$ROOT/.venv/bin/uvicorn" website_profiling.api.main:app \
    --host 0.0.0.0 --port 8096 --workers 1 &
  UVICORN_PID=$!
  disown_bg "$UVICORN_PID"
  wait_for_http "http://127.0.0.1:8096/api/health" "FastAPI" 90 || die "FastAPI failed to start"

  start_host_integrations_bff "$ROOT" Production
  disown_bg "$INTEGRATIONS_PID"
  disown_bg "$BFF_PID"

  cd "$WEB"
  npm run preview -- --host 0.0.0.0 --port 3000 &
  NPM_PID=$!
  disown_bg "$NPM_PID"
  set +e
  wait "$NPM_PID"
  exit 0
}

cmd_help() {
  cat <<EOF
Local prod runner — same Postgres as ./local-run, production Vite build + full .NET stack.

  ./local-prod              Same as: start
  ./local-prod start        DB + migrations + build + full stack + vite preview
  ./local-prod start --skip-build   Start without rebuilding (reuse dist/)
  ./local-prod build        npm run build only
  ./local-prod help         Show this help

Environment overrides (optional):
  DATABASE_URL  (default: postgres://postgres:dev@127.0.0.1:5432/website_profiling)
  DATA_DIR      (default: <repo>/data)
  VITE_BFF_BASE_URL (default: http://localhost:8090 — baked into the SPA at build time)
  AUTH_SECRET   (optional — required for Google OAuth in Production ASP.NET mode)
  GOOGLE_REDIRECT_URI, APP_PUBLIC_URL (Google OAuth callback + post-login redirect)
  WP_PG_CONTAINER, WP_PG_PORT, WP_PG_PASSWORD, WP_PG_DB

After start, open: http://localhost:3000/home
Use localhost (not 127.0.0.1) for pipeline APIs.

Dev mode with hot reload: ./local-run start
Docker prod layout: docker compose -f docker-compose.prod.yml up
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
