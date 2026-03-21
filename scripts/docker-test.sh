#!/usr/bin/env bash
# Build and run WebsiteProfiling via Docker, then smoke-test the API.
# Requires: Docker with Compose V2 (`docker compose`) or V1 (`docker-compose`).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

COMPOSE=(docker compose)
if ! docker compose version &>/dev/null; then
  if command -v docker-compose &>/dev/null; then
    COMPOSE=(docker-compose)
  else
    echo "ERROR: Install Docker Compose (docker compose or docker-compose)." >&2
    exit 1
  fi
fi

echo "==> Building images..."
"${COMPOSE[@]}" build backend

echo "==> Starting db, redis, backend, frontend..."
"${COMPOSE[@]}" up -d db redis backend frontend

echo "==> Waiting for backend /health (up to 90s)..."
for i in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    echo "==> Backend is up."
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "ERROR: Backend did not become healthy in time." >&2
    "${COMPOSE[@]}" logs backend --tail 80 >&2 || true
    exit 1
  fi
  sleep 1
done

echo "==> GET /health"
curl -sS "http://127.0.0.1:8000/health" | head -c 500
echo ""

echo "==> GET /openapi.json (first keys)"
python3 - <<'PY'
import json, urllib.request
u = "http://127.0.0.1:8000/openapi.json"
with urllib.request.urlopen(u, timeout=10) as r:
    d = json.load(r)
print("title:", d.get("info", {}).get("title"))
print("paths:", len(d.get("paths", {})))
PY

echo "==> Frontend (dev server) — optional check on :5173"
if curl -sf -o /dev/null "http://127.0.0.1:5173/" 2>/dev/null; then
  echo "Frontend responded on http://127.0.0.1:5173/"
else
  echo "Frontend not ready yet (npm install may still be running). Check: docker logs websiteprofiling_frontend"
fi

echo ""
echo "Done. API docs: http://127.0.0.1:8000/docs"
echo "Stop stack: docker compose down   (or docker-compose down)"
