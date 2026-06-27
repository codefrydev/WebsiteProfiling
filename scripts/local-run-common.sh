#!/usr/bin/env bash
# Shared helpers for local-run.sh and local-prod.sh (source, do not execute directly).

free_port() {
  local port="$1"
  local pids
  pids="$(lsof -nP -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    printf '\033[1;33m!\033[0m Stopping stale listener on port %s (PID(s): %s)\n' "$port" "${pids//$'\n'/ }" >&2
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 0.3
  fi
}

wait_for_http() {
  local url="$1"
  local name="$2"
  local timeout="${3:-60}"
  local i
  for ((i = 0; i < timeout; i++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  printf '\033[1;31m✗\033[0m %s did not become ready at %s\n' "$name" "$url" >&2
  return 1
}

start_host_dotnet_base() {
  local root="$1"
  local mode="${2:-Development}"

  export REPORT_API_URL="${REPORT_API_URL:-http://127.0.0.1:8001}"
  export AI_SERVICE_URL="${AI_SERVICE_URL:-http://127.0.0.1:8092}"
  export INTEGRATIONS_SERVICE_URL="${INTEGRATIONS_SERVICE_URL:-http://127.0.0.1:8093}"
  export REPORT_SERVICE_URL="${REPORT_SERVICE_URL:-http://127.0.0.1:8094}"
  export FILE_SERVICE_URL="${FILE_SERVICE_URL:-http://127.0.0.1:8080}"

  free_port 8080
  printf '\033[1;36m→\033[0m Starting FileService on port 8080\n'
  (cd "$root/services/FileService" && \
    ASPNETCORE_URLS="http://127.0.0.1:8080" \
    ASPNETCORE_ENVIRONMENT="$mode" \
    dotnet run --project src/FileService.Api --no-launch-profile) &
  FILE_SERVICE_PID=$!

  free_port 8091
  printf '\033[1;36m→\033[0m Starting Data service on port 8091\n'
  (cd "$root/services/Data" && \
    DATABASE_URL="$DATABASE_URL" \
    ASPNETCORE_URLS="http://127.0.0.1:8091" \
    ASPNETCORE_ENVIRONMENT="$mode" \
    dotnet run --project src/Data.Api --no-launch-profile) &
  DATA_PID=$!

  free_port 8095
  printf '\033[1;36m→\033[0m Starting ConfigService on port 8095\n'
  (cd "$root/services/ConfigService" && \
    DATABASE_URL="$DATABASE_URL" \
    WEBSITE_PROFILING_ROOT="$root" \
    ASPNETCORE_URLS="http://127.0.0.1:8095" \
    ASPNETCORE_ENVIRONMENT="$mode" \
    dotnet run --project src/ConfigService.Api --no-launch-profile) &
  CONFIG_PID=$!

  free_port 8092
  printf '\033[1;36m→\033[0m Starting AiService on port 8092\n'
  (cd "$root/services/AiService" && \
    DATABASE_URL="$DATABASE_URL" \
    FASTAPI_URL="http://127.0.0.1:8001" \
    ASPNETCORE_URLS="http://127.0.0.1:8092" \
    ASPNETCORE_ENVIRONMENT="$mode" \
    WP_MCP_HTTP=1 \
    dotnet run --project src/AiService.Api --no-launch-profile) &
  AI_PID=$!

  wait_for_http "http://127.0.0.1:8080/health" "FileService"
  wait_for_http "http://127.0.0.1:8091/health" "Data service"
  wait_for_http "http://127.0.0.1:8095/health" "ConfigService"
  wait_for_http "http://127.0.0.1:8092/health" "AiService"
}

start_host_report_service() {
  local root="$1"
  local mode="${2:-Development}"

  free_port 8094
  printf '\033[1;36m→\033[0m Starting ReportService on port 8094\n'
  (cd "$root/services/ReportService" && \
    DATABASE_URL="$DATABASE_URL" \
    FASTAPI_URL="http://127.0.0.1:8001" \
    INTEGRATIONS_SERVICE_URL="$INTEGRATIONS_SERVICE_URL" \
    AISERVICE_URL="${AISERVICE_URL:-${AI_SERVICE_URL:-http://127.0.0.1:8092}}" \
    WEBSITE_PROFILING_ROOT="$root" \
    DATA_DIR="${DATA_DIR:-$root/data}" \
    PYTHON="${PYTHON:-$root/.venv/bin/python}" \
    REPORT_SERVICE_USE_PYTHON_BRIDGE="${REPORT_SERVICE_USE_PYTHON_BRIDGE:-0}" \
    REPORT_SERVICE_VALIDATE_NATIVE="${REPORT_SERVICE_VALIDATE_NATIVE:-1}" \
    REPORT_SERVICE_WORKER_ENABLED="${REPORT_SERVICE_WORKER_ENABLED:-1}" \
    ASPNETCORE_URLS="http://127.0.0.1:8094" \
    ASPNETCORE_ENVIRONMENT="$mode" \
    dotnet run --project src/ReportService.Api --no-launch-profile) &
  REPORT_PID=$!
  wait_for_http "http://127.0.0.1:8094/health" "ReportService"
}

start_host_integrations_bff() {
  local root="$1"
  local mode="${2:-Development}"

  free_port 8093
  printf '\033[1;36m→\033[0m Starting IntegrationsService on port 8093\n'
  (cd "$root/services/IntegrationsService" && \
    DATABASE_URL="$DATABASE_URL" \
    FASTAPI_URL="http://127.0.0.1:8001" \
    USE_FASTAPI_PYTHON_BRIDGE="${USE_FASTAPI_PYTHON_BRIDGE:-1}" \
    ASPNETCORE_URLS="http://127.0.0.1:8093" \
    ASPNETCORE_ENVIRONMENT="$mode" \
    AUTH_SECRET="${AUTH_SECRET:-}" \
    SESSION_SECRET="${SESSION_SECRET:-}" \
    GOOGLE_REDIRECT_URI="${GOOGLE_REDIRECT_URI:-http://localhost:8090/api/integrations/google/callback}" \
    APP_PUBLIC_URL="${APP_PUBLIC_URL:-http://localhost:3000}" \
    dotnet run --project src/IntegrationsService.Api --no-launch-profile) &
  INTEGRATIONS_PID=$!
  wait_for_http "http://127.0.0.1:8093/health" "IntegrationsService"

  free_port 8090
  printf '\033[1;36m→\033[0m Starting BFF on port 8090\n'
  (cd "$root/services/Bff" && \
    FASTAPI_URL="http://127.0.0.1:8001" \
    FILE_SERVICE_URL="$FILE_SERVICE_URL" \
    DATA_SERVICE_URL="http://127.0.0.1:8091" \
    AI_SERVICE_URL="$AI_SERVICE_URL" \
    INTEGRATIONS_SERVICE_URL="$INTEGRATIONS_SERVICE_URL" \
    REPORT_SERVICE_URL="${REPORT_SERVICE_URL:-http://127.0.0.1:8094}" \
    REPORT_ROUTES="${REPORT_ROUTES:-/api/compare,/api/dashboards,/api/run,/api/jobs,/api/schedule,/api/crawl}" \
    CONFIG_SERVICE_URL="${CONFIG_SERVICE_URL:-http://127.0.0.1:8095}" \
    CONFIG_ROUTES="${CONFIG_ROUTES:-/api/pipeline-settings,/api/ui-preferences,/api/client-preferences}" \
    DATA_ROUTES="${DATA_ROUTES:-/api/report/meta,/api/report/payload,/api/report/history,/api/report/crawl-payload,/api/report/mobile-delta,/api/report/portfolio,/api/portfolio,/api/issues/status,/api/filters,/api/properties,/api/content-drafts,/api/content/score,/api/keywords,/api/page-markdown,/api/alerts,/api/logs,/api/backlinks}" \
    AI_ROUTES="${AI_ROUTES:-/api/chat,/api/links/page-coach,/api/issues/fix-suggestion,/api/issues/action-plan,/api/ai/fix-suggestion,/api/dashboards/ai-generate,/api/content/analyze,/api/content/wizard,/api/llm-settings,/api/secrets,/api/ollama/status,/api/report/audit-tool,/api/mcp-tools}" \
    INTEGRATIONS_ROUTES="${INTEGRATIONS_ROUTES:-/api/integrations/google,/api/integrations/bing}" \
    BFF_ALLOWED_ORIGINS="${BFF_ALLOWED_ORIGINS:-http://localhost:3000}" \
    AUTH_SECRET="${AUTH_SECRET:-}" \
    SESSION_SECRET="${SESSION_SECRET:-}" \
    AUTH_PASSWORD="${AUTH_PASSWORD:-}" \
    AUTH_USER="${AUTH_USER:-}" \
    ASPNETCORE_URLS="http://127.0.0.1:8090" \
    ASPNETCORE_ENVIRONMENT="$mode" \
    dotnet run --project src/Bff.Api --no-launch-profile) &
  BFF_PID=$!
  wait_for_http "http://127.0.0.1:8090/health" "BFF"
}

start_host_dotnet_stack() {
  local root="$1"
  local mode="${2:-Development}"
  start_host_dotnet_base "$root" "$mode"
  start_host_report_service "$root" "$mode"
  start_host_integrations_bff "$root" "$mode"
}

stop_host_dotnet_stack() {
  local stop_service_fn="$1"
  "$stop_service_fn" "BFF" "${BFF_PID:-}" 8090
  BFF_PID=""
  "$stop_service_fn" "IntegrationsService" "${INTEGRATIONS_PID:-}" 8093
  INTEGRATIONS_PID=""
  "$stop_service_fn" "ReportService" "${REPORT_PID:-}" 8094
  REPORT_PID=""
  "$stop_service_fn" "AiService" "${AI_PID:-}" 8092
  AI_PID=""
  "$stop_service_fn" "ConfigService" "${CONFIG_PID:-}" 8095
  CONFIG_PID=""
  "$stop_service_fn" "Data" "${DATA_PID:-}" 8091
  DATA_PID=""
  "$stop_service_fn" "FileService" "${FILE_SERVICE_PID:-}" 8080
  FILE_SERVICE_PID=""
}
