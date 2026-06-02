# syntax=docker/dockerfile:1
# WebsiteProfiling: Next.js web UI + Python pipeline (spawned from /api/run).
# Build from repository root: docker build -t website-profiling .
# BuildKit cache mounts (default in Docker Desktop) reuse pip/npm downloads across rebuilds.

FROM node:20-bookworm-slim AS base

# Python venv + Chromium + build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    python3 \
    python3-venv \
    python3-pip \
    chromium \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
  && rm -rf /var/lib/apt/lists/*

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    NEXT_TELEMETRY_DISABLED=1 \
    WEBSITE_PROFILING_ROOT=/app \
    DATABASE_URL=postgres://profiling:profiling@postgres:5432/website_profiling \
    DATA_DIR=/data \
    PYTHON=/opt/venv/bin/python \
    CHROME_PATH=/usr/bin/chromium \
    LIGHTHOUSE_PATH=/usr/local/bin/lighthouse

# Python: base requirements + optional LLM API clients
COPY requirements.txt /app/requirements.txt
COPY requirements-llm.txt /app/requirements-llm.txt
COPY alembic.ini /app/alembic.ini
COPY alembic /app/alembic
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --upgrade pip \
  && /opt/venv/bin/pip install -r /app/requirements.txt \
  && /opt/venv/bin/pip install -r /app/requirements-llm.txt \
  && ln -sf /opt/venv/bin/python /usr/local/bin/python \
  && ln -sf /opt/venv/bin/python /usr/local/bin/python3

# Pre-install Lighthouse CLI (avoid flaky parallel `npx -y lighthouse` at runtime).
RUN --mount=type=cache,target=/root/.npm \
    npm install -g lighthouse@12.6.0 \
  && lighthouse --version

WORKDIR /app

# Next.js install + build (layer cache)
COPY web/package.json web/package-lock.json /app/web/
RUN --mount=type=cache,target=/root/.npm \
    cd /app/web && npm ci

# Application source
COPY src /app/src
COPY web /app/web
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

RUN cd /app/web && npm run build && npm prune --omit=dev

ENV NODE_ENV=production

# Persisted data directory (secrets + shadow config)
RUN mkdir -p /data && chmod +x /app/docker-entrypoint.sh

EXPOSE 3000

CMD ["/app/docker-entrypoint.sh"]
