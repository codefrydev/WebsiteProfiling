#!/usr/bin/env bash
# Local test runner — mirrors .github/workflows/ci.yml on your machine.
# Usage: ./local-test [command] [--no-cov]
#   (default) all     — Postgres + migrations + Python + web checks
#   python            — DB + pytest + CLI smoke only
#   web               — typecheck, lint, vitest (no Postgres)
#   quick             — pytest --no-cov + web (DB must already be running)
#   help              — show commands
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
export WEBSITE_PROFILING_ROOT="$ROOT"
export PYTHONPATH="${PYTHONPATH:+$PYTHONPATH:}$ROOT/src"

VENV="$ROOT/.venv"
WEB="$ROOT/web"
PYTEST_NO_COV=0

log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; exit 1; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

ensure_docker() {
  need_cmd docker
  if ! docker info >/dev/null 2>&1; then
    die "Docker is not running. Start Docker Desktop, then retry (or: ./local-test quick with DATABASE_URL set)."
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
  if [[ ! -x "$VENV/bin/pytest" ]]; then
    log "Installing Python dependencies"
    "$VENV/bin/pip" install -q -r "$ROOT/requirements.txt"
    "$VENV/bin/pip" install -q -r "$ROOT/requirements-browser.txt"
  fi
}

cmd_migrate() {
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

run_pytest() {
  if [[ "$PYTEST_NO_COV" -eq 1 ]]; then
    log "Pytest (tests/ -q --no-cov)"
    "$VENV/bin/pytest" tests/ -q --no-cov
  else
    log "Pytest (tests/ -q, 100% in-scope coverage gate — same as CI)"
    "$VENV/bin/pytest" tests/ -q
  fi
}

run_browser_pytest() {
  if "$VENV/bin/python" -c "from website_profiling.crawl.fetchers import browser_status; import sys; sys.exit(0 if browser_status().get('ok') else 1)" 2>/dev/null; then
    log "Browser pytest (tests/test_crawl_fetchers.py tests/test_crawler_browser_e2e.py -m browser)"
    "$VENV/bin/pytest" tests/test_crawl_fetchers.py tests/test_crawler_browser_e2e.py -m browser -q --no-cov
  else
    warn "Chromium unavailable — skipping browser integration tests"
  fi
}

cmd_python() {
  cmd_db
  cmd_venv
  cmd_migrate
  run_pytest
  run_browser_pytest
  log "CLI smoke (python -m src --help)"
  "$VENV/bin/python" -m src --help >/dev/null
  ok "Python checks passed"
}

cmd_browser() {
  cmd_venv
  run_browser_pytest
  ok "Browser pytest finished"
}

cmd_web() {
  cmd_web_deps
  log "Web typecheck"
  (cd "$WEB" && npm run typecheck)
  log "Web lint"
  (cd "$WEB" && npm run lint)
  log "Web tests (vitest)"
  (cd "$WEB" && npm test)
  ok "Web checks passed"
}

cmd_all() {
  cmd_python
  cmd_web
  ok "All local tests passed (CI python + web jobs)"
}

cmd_quick() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    die "DATABASE_URL is not set. Export it or run ./local-test all."
  fi
  cmd_venv
  cmd_web_deps
  warn "quick: assuming Postgres is up and migrated (./local-run db && ./local-run migrate)"
  run_pytest
  log "CLI smoke (python -m src --help)"
  "$VENV/bin/python" -m src --help >/dev/null
  log "Web typecheck"
  (cd "$WEB" && npm run typecheck)
  log "Web lint"
  (cd "$WEB" && npm run lint)
  log "Web tests (vitest)"
  (cd "$WEB" && npm test)
  ok "Quick test run passed"
}

cmd_help() {
  cat <<EOF
Local test runner — mirrors CI (python + web jobs)

  ./local-test              Same as: all
  ./local-test all          Postgres + migrations + pytest + CLI + web checks
  ./local-test python       DB + pytest + browser pytest + python -m src --help
  ./local-test browser      Browser integration pytest only (skips if no Chromium)
  ./local-test web          typecheck, lint, vitest (no Docker)
  ./local-test quick        pytest + web without starting Docker (DB must be ready)

  ./local-test all --no-cov     skip pytest coverage gate (faster)
  ./local-test quick            uses --no-cov by default

Environment (same as ./local-run):
  DATABASE_URL, DATA_DIR, WP_PG_CONTAINER, WP_PG_PORT, ...

One-time dev setup: ./local-run setup
EOF
}

main() {
  local raw_cmd="${1:-all}"
  shift || true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --no-cov) PYTEST_NO_COV=1 ;;
      -h|--help) cmd_help; exit 0 ;;
      *) die "Unknown argument: $1 (try: ./local-test help)" ;;
    esac
    shift
  done

  case "$raw_cmd" in
    all|"") cmd_all ;;
    python) cmd_python ;;
    browser) cmd_browser ;;
    web) cmd_web ;;
    quick)
      PYTEST_NO_COV=1
      cmd_quick
      ;;
    help|-h|--help) cmd_help ;;
    *)
      die "Unknown command: $raw_cmd (try: ./local-test help)"
      ;;
  esac
}

main "$@"
