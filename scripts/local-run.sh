#!/usr/bin/env bash
# Local dev: PostgreSQL in Docker (wp-pg), Python venv + Vite on the host.
# Usage: ./local-run [command]
#   (default) start   — ensure DB, migrations, vite dev + BFF
#   setup           — DB + venv + deps + migrations (no web server)
#   db              — start Postgres container only
#   migrate         — alembic upgrade head
#   test            — run full CI-style test suite (./local-test all)
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

# Kill any process still listening on a TCP port (stale dev servers after Ctrl+C).
free_port() {
  local port="$1"
  local pids
  pids="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    warn "Stopping stale listener on port $port (PID(s): ${pids//$'\n'/ })"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.3
  fi
}

# Send signal to a process and its descendants (dotnet/npm subshell trees).
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

# Detach background jobs so bash does not print "Terminated" after cleanup.
disown_bg() {
  local pid="$1"
  [[ -z "$pid" ]] && return 0
  disown "$pid" 2>/dev/null || true
}

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
  FILE_SERVICE_PID=""
  DATA_PID=""
  BFF_PID=""
  _CLEANUP_DONE=0
  set +m

  cleanup_local() {
    if [[ "$_CLEANUP_DONE" -eq 1 ]]; then
      return 0
    fi
    _CLEANUP_DONE=1
    trap - INT TERM EXIT
    set +e

    log "Shutting down local dev stack..."
    # Reverse startup order; Vite (foreground) is already exiting from Ctrl+C.
    stop_service "BFF" "$BFF_PID" 8090
    BFF_PID=""
    stop_service "Data" "$DATA_PID" 8091
    DATA_PID=""
    stop_service "FastAPI" "$UVICORN_PID" 8001
    UVICORN_PID=""
    stop_service "pipeline worker" "$WORKER_PID"
    WORKER_PID=""
    stop_service "FileService" "$FILE_SERVICE_PID" 8080
    FILE_SERVICE_PID=""
    stop_postgres
    log "All services stopped."
    exit 0
  }
  trap cleanup_local EXIT INT TERM

  if command -v dotnet >/dev/null 2>&1; then
    free_port 8080
    log "Starting FileService on port 8080"
    export REPORT_API_URL="http://127.0.0.1:8001"
    (cd "$ROOT/services/FileService" && \
      ASPNETCORE_URLS="http://127.0.0.1:8080" \
      ASPNETCORE_ENVIRONMENT=Development \
      dotnet run --project src/FileService.Api --no-launch-profile) &
    FILE_SERVICE_PID=$!
    disown_bg "$FILE_SERVICE_PID"

    free_port 8091
    log "Starting Data service on port 8091"
    (cd "$ROOT/services/Data" && \
      DATABASE_URL="$DATABASE_URL" \
      ASPNETCORE_URLS="http://127.0.0.1:8091" \
      ASPNETCORE_ENVIRONMENT=Development \
      dotnet run --project src/Data.Api --no-launch-profile) &
    DATA_PID=$!
    disown_bg "$DATA_PID"
  else
    warn "dotnet not found — PDF export requires FileService (see services/FileService/README.md)"
    warn "dotnet not found — Data service unavailable on port 8091"
  fi

  log "Starting pipeline worker"
  "$VENV/bin/python" -m website_profiling.worker &
  WORKER_PID=$!
  disown_bg "$WORKER_PID"

  free_port 8001
  log "Starting FastAPI on port 8001"
  export FASTAPI_URL="http://127.0.0.1:8001"
  export FASTAPI_ALLOWED_ORIGINS="http://localhost:8090"
  "$VENV/bin/uvicorn" website_profiling.api.main:app \
    --host 0.0.0.0 --port 8001 --workers 1 &
  UVICORN_PID=$!
  disown_bg "$UVICORN_PID"

  if command -v dotnet >/dev/null 2>&1; then
    free_port 8090
    log "Starting BFF on port 8090"
    (cd "$ROOT/services/Bff" && \
      FASTAPI_URL="http://127.0.0.1:8001" \
      FILE_SERVICE_URL="${FILE_SERVICE_URL:-http://127.0.0.1:8080}" \
      DATA_SERVICE_URL="http://127.0.0.1:8091" \
      DATA_ROUTES="${DATA_ROUTES:-/api/report/meta,/api/report/payload,/api/report/history,/api/report/crawl-payload,/api/report/mobile-delta,/api/report/portfolio,/api/portfolio,/api/issues/status,/api/filters}" \
      BFF_ALLOWED_ORIGINS="http://localhost:3000" \
      ASPNETCORE_URLS="http://127.0.0.1:8090" \
      ASPNETCORE_ENVIRONMENT=Development \
      dotnet run --project src/Bff.Api --no-launch-profile) &
    BFF_PID=$!
    disown_bg "$BFF_PID"
  else
    warn "dotnet not found — browser API calls need the BFF (see services/Bff/)"
  fi

  log "Starting Vite dev server (Ctrl+C stops all services including Postgres)"
  log "DATABASE_URL=$DATABASE_URL"
  log "DATA_DIR=$DATA_DIR"
  log "PYTHON=$PYTHON"
  log "VITE_BFF_BASE_URL=${VITE_BFF_BASE_URL:-http://localhost:8090}"
  log "FILE_SERVICE_URL=${FILE_SERVICE_URL:-http://127.0.0.1:8080}"
  log "DATA_ROUTES=${DATA_ROUTES:-/api/report/meta,...}"
  export FILE_SERVICE_URL="${FILE_SERVICE_URL:-http://127.0.0.1:8080}"
  export VITE_BFF_BASE_URL="${VITE_BFF_BASE_URL:-http://localhost:8090}"
  cd "$WEB"
  set +e
  npm run dev
  exit 0
}

cmd_stop() {
  need_cmd docker
  if ! docker info >/dev/null 2>&1; then
    die "Docker is not running. Start Docker Desktop, then retry."
  fi
  if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    stop_postgres
  else
    warn "Container $PG_CONTAINER is not running"
  fi
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

cmd_test() {
  shift
  exec "$ROOT/scripts/local-test.sh" all "$@"
}

cmd_help() {
  cat <<EOF
Local dev runner — Postgres in Docker, app on your machine

  ./local-run              Same as: start
  ./local-run start        DB + migrations + npm run dev (Ctrl+C stops all services + Postgres)
  ./local-run setup        One-time setup (no dev server)
  ./local-run db           Start Postgres only
  ./local-run migrate      Run alembic upgrade head
  ./local-run test         Run full CI-style tests (./local-test all)
  ./local-run stop         Stop Postgres container

Environment overrides (optional):
  DATABASE_URL  (default: postgres://postgres:dev@127.0.0.1:5432/website_profiling)
  DATA_DIR      (default: <repo>/data)
  DATA_ROUTES   (default: report reads, portfolio, issues status, saved filters)
  WP_PG_CONTAINER, WP_PG_PORT, WP_PG_PASSWORD, WP_PG_DB

After start, open: http://localhost:3000/home
Run audits via sidebar "Run audit" (bottom-right FAB).

Production build (same Postgres, no hot reload): ./local-prod start

Run CI-style tests: ./local-test or ./local-run test (see ./local-test help).
EOF
}

main() {
  local cmd="${1:-start}"
  case "$cmd" in
    start) cmd_start ;;
    setup) cmd_setup ;;
    db) cmd_db ;;
    migrate) cmd_migrate ;;
    test) cmd_test "$@" ;;
    stop) cmd_stop ;;
    help|-h|--help) cmd_help ;;
    *)
      die "Unknown command: $cmd (try: ./local-run help)"
      ;;
  esac
}

main "$@"
