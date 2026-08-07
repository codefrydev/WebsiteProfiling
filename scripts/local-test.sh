#!/usr/bin/env bash
# Local test runner — mirrors .github/workflows/ci.yml on your machine.
# Usage: ./local-test [command] [--no-cov]
#   (default) all     — Postgres + migrations + Python + web + .NET (Data, Bff)
#   python            — DB + pytest + CLI smoke only
#   web               — build, typecheck, lint, vitest (no Postgres)
#   dotnet            — dotnet test services/WebsiteProfiling.slnx + Bff OpenAPI drift gate
#   quick             — pytest --no-cov + web + dotnet (DB must already be running)
#   help              — show commands
set -uo pipefail

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

# shellcheck source=scripts/ensure-deps.sh
source "$ROOT/scripts/ensure-deps.sh"

STEP_PASS=()
STEP_FAIL=()   # entries: "name|detail"
STEP_SKIP=()   # entries: "name|reason"

log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*" >&2; }
fail_msg() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }
die() { fail_msg "$*"; exit 1; }

reset_steps() {
  STEP_PASS=()
  STEP_FAIL=()
  STEP_SKIP=()
}

run_step() {
  local name="$1"
  shift
  log "$name"
  local ec=0
  "$@" || ec=$?
  if [[ "$ec" -eq 0 ]]; then
    STEP_PASS+=("$name")
  else
    STEP_FAIL+=("$name|exit code $ec")
  fi
}

skip_step() {
  local name="$1"
  local reason="${2:-skipped}"
  warn "$name — $reason"
  STEP_SKIP+=("$name|$reason")
}

print_summary() {
  local total_pass=${#STEP_PASS[@]}
  local total_fail=${#STEP_FAIL[@]}
  local total_skip=${#STEP_SKIP[@]}
  local entry name detail

  printf '\n'
  printf '\033[1m═══════════════════════════════════════════════════════════════\033[0m\n'
  printf '\033[1m Test summary\033[0m\n'
  printf '\033[1m═══════════════════════════════════════════════════════════════\033[0m\n'

  if [[ "$total_pass" -gt 0 ]]; then
    printf '\n\033[1;32mPASSED (%d)\033[0m\n' "$total_pass"
    for name in "${STEP_PASS[@]}"; do
      printf '  \033[1;32m✓\033[0m %s\n' "$name"
    done
  fi

  if [[ "$total_fail" -gt 0 ]]; then
    printf '\n\033[1;31mFAILED (%d)\033[0m\n' "$total_fail"
    for entry in "${STEP_FAIL[@]}"; do
      name="${entry%%|*}"
      detail="${entry#*|}"
      printf '  \033[1;31m✗\033[0m %s (%s)\n' "$name" "$detail"
    done
  fi

  if [[ "$total_skip" -gt 0 ]]; then
    printf '\n\033[1;33mSKIPPED (%d)\033[0m\n' "$total_skip"
    for entry in "${STEP_SKIP[@]}"; do
      name="${entry%%|*}"
      detail="${entry#*|}"
      printf '  \033[1;33m-\033[0m %s (%s)\n' "$name" "$detail"
    done
  fi

  printf '\n\033[1m───────────────────────────────────────────────────────────────\033[0m\n'
  if [[ "$total_fail" -eq 0 ]]; then
    ok "All steps passed ($total_pass passed, $total_skip skipped)"
  else
    fail_msg "$total_fail failed, $total_pass passed, $total_skip skipped"
  fi
  printf '\n'
}

finish() {
  print_summary
  [[ ${#STEP_FAIL[@]} -eq 0 ]]
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

start_postgres() {
  need_cmd docker || { warn "docker not found"; return 1; }
  if ! docker info >/dev/null 2>&1; then
    warn "Docker is not running"
    return 1
  fi
  if docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
    if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
      log "Postgres already running ($PG_CONTAINER)"
    else
      log "Starting existing container $PG_CONTAINER"
      docker start "$PG_CONTAINER" >/dev/null || return 1
    fi
  else
    log "Creating Postgres container $PG_CONTAINER on port $PG_PORT"
    docker run -d --name "$PG_CONTAINER" \
      -e "POSTGRES_PASSWORD=$PG_PASSWORD" \
      -e "POSTGRES_DB=$PG_DB" \
      -p "${PG_PORT}:5432" \
      "$PG_IMAGE" >/dev/null || return 1
  fi
  local i
  for i in $(seq 1 30); do
    if docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
      log "DATABASE_URL=$DATABASE_URL"
      return 0
    fi
    sleep 1
  done
  warn "Postgres did not become ready in time (container: $PG_CONTAINER)"
  return 1
}

ensure_venv() {
  if ! (ensure_system_tools); then
    return 1
  fi
  ensure_python_deps
}

run_migrate() {
  ensure_system_tools
  ensure_dotnet_deps
  dotnet run --project "$ROOT/services/Schema/src/Schema.Migrator" --no-launch-profile
}

ensure_web_deps_step() {
  ensure_web_deps
}

run_pytest_core() {
  if [[ "$PYTEST_NO_COV" -eq 1 ]]; then
    "$VENV/bin/pytest" tests/ -q -m "not browser" --no-cov
  else
    "$VENV/bin/pytest" tests/ -q -m "not browser"
  fi
}

run_pytest_reporting() {
  [[ "$PYTEST_NO_COV" -eq 1 ]] && return 0
  "$VENV/bin/pytest" \
    tests/reporting/ \
    --cov=website_profiling.reporting \
    --cov-config=.coveragerc.reporting \
    --cov-report=term-missing \
    --cov-fail-under=100 \
    -q \
    -o addopts=
}

run_pytest_tools() {
  [[ "$PYTEST_NO_COV" -eq 1 ]] && return 0
  "$VENV/bin/pytest" \
    tests/tools/ \
    tests/clients/ \
    --cov=website_profiling.tools \
    --cov-config=.coveragerc.tools \
    --cov-report=term-missing \
    --cov-fail-under=100 \
    -q \
    -o addopts=
}

run_browser_pytest() {
  if "$VENV/bin/python" -c "from website_profiling.crawl.fetchers import browser_status; import sys; sys.exit(0 if browser_status().get('ok') else 1)" 2>/dev/null; then
    "$VENV/bin/pytest" tests/test_crawl_fetchers.py tests/test_crawler_browser_e2e.py -m browser -q --no-cov
  else
    return 2
  fi
}

run_cli_smoke() {
  "$VENV/bin/python" -m src --help >/dev/null
}

run_web_build() { (cd "$WEB" && npm run build); }
run_web_typecheck() { (cd "$WEB" && npm run typecheck); }
run_web_lint() { (cd "$WEB" && npm run lint); }
run_web_test() { (cd "$WEB" && npm test); }

dotnet_test_sln() {
  (cd "$ROOT/services" && dotnet test WebsiteProfiling.slnx -m:1)
}

run_bff_openapi_drift_gate() {
  if ! need_cmd dotnet; then
    return 0
  fi
  if ! need_cmd nswag; then
    if dotnet tool list -g 2>/dev/null | grep -q NSwag.ConsoleCore; then
      export PATH="$PATH:$HOME/.dotnet/tools"
    else
      log "Installing NSwag.ConsoleCore (Bff OpenAPI drift gate)"
      dotnet tool install -g NSwag.ConsoleCore || return 1
      export PATH="$PATH:$HOME/.dotnet/tools"
    fi
  fi
  if ! need_cmd nswag; then
    return 2
  fi
  (cd "$ROOT/services/Bff" && nswag run nswag.json) || return 1
  git diff --exit-code services/Bff/src/Bff.Application/Generated/FastApiClient.g.cs
}

run_step_or_skip_browser() {
  local name="Browser pytest (tests/test_crawl_fetchers.py, tests/test_crawler_browser_e2e.py)"
  log "$name"
  local ec=0
  run_browser_pytest || ec=$?
  if [[ "$ec" -eq 0 ]]; then
    STEP_PASS+=("$name")
  elif [[ "$ec" -eq 2 ]]; then
    skip_step "$name" "Chromium unavailable"
  else
    STEP_FAIL+=("$name|exit code $ec")
  fi
}

run_step_or_skip_openapi() {
  local name="Bff OpenAPI drift gate (FastApiClient.g.cs)"
  log "$name"
  local ec=0
  run_bff_openapi_drift_gate || ec=$?
  if [[ "$ec" -eq 0 ]]; then
    STEP_PASS+=("$name")
  elif [[ "$ec" -eq 2 ]]; then
    skip_step "$name" "nswag not on PATH"
  else
    STEP_FAIL+=("$name|exit code $ec — run services/Bff/generate-client.sh and commit")
  fi
}

steps_postgres() {
  if ! (ensure_system_tools); then
    skip_step "Postgres ($PG_CONTAINER)" "system tools unavailable"
    return 0
  fi
  run_step "Postgres ($PG_CONTAINER)" start_postgres
}

steps_venv() {
  run_step "Python venv + dependencies" ensure_venv
}

steps_migrate() {
  run_step "Database migrations (EF Core: Schema.Migrator)" run_migrate
}

steps_pytest() {
  if [[ "$PYTEST_NO_COV" -eq 1 ]]; then
    run_step "Pytest core (tests/ — no coverage)" run_pytest_core
    skip_step "Pytest reporting coverage gate" "--no-cov"
    skip_step "Pytest tools coverage gate" "--no-cov"
  else
    run_step "Pytest core (tests/ — 100% coverage gate)" run_pytest_core
    run_step "Pytest reporting coverage gate (tests/reporting/)" run_pytest_reporting
    run_step "Pytest tools coverage gate (tests/tools/, tests/clients/)" run_pytest_tools
  fi
}

steps_browser() {
  run_step_or_skip_browser
}

steps_cli_smoke() {
  run_step "CLI smoke (python -m src --help)" run_cli_smoke
}

steps_web_deps() {
  if ! (ensure_system_tools); then
    skip_step "Web dependencies (npm ci if needed)" "system tools unavailable"
    return 0
  fi
  run_step "Web dependencies (npm ci if needed)" ensure_web_deps_step
}

steps_web() {
  steps_web_deps
  run_step "Web build (web/)" run_web_build
  run_step "Web typecheck (web/)" run_web_typecheck
  run_step "Web lint (web/)" run_web_lint
  run_step "Web tests / vitest (web/)" run_web_test
}

steps_dotnet() {
  if ! (ensure_system_tools); then
    skip_step ".NET tests (WebsiteProfiling.slnx)" "system tools unavailable"
    return 0
  fi
  if ! command -v dotnet >/dev/null 2>&1; then
    skip_step ".NET tests (WebsiteProfiling.slnx)" "dotnet not found"
    return 0
  fi
  ensure_dotnet_deps || true
  run_step "dotnet test (WebsiteProfiling.slnx)" dotnet_test_sln
  run_step_or_skip_openapi
}

steps_python() {
  steps_postgres
  steps_venv
  steps_migrate
  steps_pytest
  steps_browser
  steps_cli_smoke
}

cmd_python() {
  reset_steps
  steps_python
  finish
}

cmd_browser() {
  reset_steps
  run_step "Python venv + dependencies" ensure_venv
  run_step_or_skip_browser
  finish
}

cmd_web() {
  reset_steps
  if ! (ensure_system_tools); then
    die "System tools unavailable (see README.md prerequisites)"
  fi
  steps_web
  finish
}

cmd_dotnet() {
  reset_steps
  steps_dotnet
  finish
}

cmd_all() {
  reset_steps
  steps_python
  steps_web
  steps_dotnet
  finish
}

cmd_quick() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    die "DATABASE_URL is not set. Export it or run ./local-test all."
  fi
  reset_steps
  warn "quick: assuming Postgres is up and migrated (./local-run db && ./local-run migrate)"
  PYTEST_NO_COV=1
  steps_venv
  steps_pytest
  steps_cli_smoke
  steps_web
  steps_dotnet
  finish
}

cmd_help() {
  cat <<EOF
Local test runner — mirrors .github/workflows/ci.yml

  ./local-test              Same as: all
  ./local-test all          Postgres + migrations + pytest + web + .NET (Data, Bff)
  ./local-test python       DB + pytest (core + reporting + tools) + browser pytest + CLI smoke
  ./local-test browser      Browser integration pytest only (skips if no Chromium)
  ./local-test web          build, typecheck, lint, vitest (no Docker)
  ./local-test dotnet       dotnet test services/WebsiteProfiling.slnx + Bff OpenAPI drift gate
  ./local-test quick        pytest --no-cov + web + dotnet (DB must be ready)

  ./local-test all --no-cov     skip pytest coverage gates (faster)
  ./local-test quick            uses --no-cov for pytest by default

Failed steps do not stop the run — a pass/fail summary is printed at the end.

Also: ./local-run test   (alias for ./local-test all)

Environment (same as ./local-run):
  DATABASE_URL, DATA_DIR, WP_PG_CONTAINER, WP_PG_PORT, ...
  WP_SKIP_SYSTEM_INSTALL, WP_SKIP_DEPS_SYNC

One-time dev setup: ./local-run setup (optional — ./local-run syncs deps automatically)
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
    dotnet) cmd_dotnet ;;
    quick) cmd_quick ;;
    help|-h|--help) cmd_help ;;
    *)
      die "Unknown command: $raw_cmd (try: ./local-test help)"
      ;;
  esac
}

main "$@"
