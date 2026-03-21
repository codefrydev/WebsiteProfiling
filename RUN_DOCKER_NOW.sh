#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon not running. Start Docker Desktop, then run this again."
  exit 1
fi

DC=(docker compose)
if ! docker compose version &>/dev/null; then
  if command -v docker-compose &>/dev/null; then
    DC=(docker-compose)
  else
    echo "ERROR: Install Docker Compose (Plugins: docker compose) or docker-compose v1."
    exit 1
  fi
fi

echo "==> Building & starting stack..."
"${DC[@]}" up -d --build

echo "==> Waiting for http://127.0.0.1:8000/health ..."
for i in $(seq 1 120); do
  if curl -sf "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    echo ""
    echo "OK:"
    curl -s "http://127.0.0.1:8000/health"
    echo ""
    echo ""
    echo "API docs: http://127.0.0.1:8000/docs"
    echo "UI:       http://127.0.0.1:5173"
    exit 0
  fi
  sleep 1
done

echo "Backend did not respond. Logs:"
"${DC[@]}" logs backend --tail 100
exit 1
