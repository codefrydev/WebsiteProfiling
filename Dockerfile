# syntax=docker/dockerfile:1
# WebsiteProfiling: FastAPI (port 8001) + Python worker + pipeline.
# Web UI is a separate image: web/Dockerfile (Vite SPA + nginx).
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
    WEBSITE_PROFILING_ROOT=/app \
    PYTHONPATH=/app/src \
    DATA_DIR=/data \
    PYTHON=/opt/venv/bin/python \
    CHROME_PATH=/usr/bin/chromium \
    LIGHTHOUSE_PATH=/usr/local/bin/lighthouse

# Python dependencies
COPY requirements.txt /app/requirements.txt
COPY alembic.ini /app/alembic.ini
COPY alembic /app/alembic
RUN --mount=type=cache,target=/root/.cache/pip \
    python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --upgrade pip \
  && /opt/venv/bin/pip install -r /app/requirements.txt \
  && ln -sf /opt/venv/bin/python /usr/local/bin/python \
  && ln -sf /opt/venv/bin/python /usr/local/bin/python3

# Pre-install Lighthouse CLI (avoid flaky parallel `npx -y lighthouse` at runtime).
RUN --mount=type=cache,target=/root/.npm \
    npm install -g lighthouse@12.6.0 \
  && lighthouse --version

WORKDIR /app

# Application source
COPY pytest.ini /app/pytest.ini
COPY config/typed_config_manifest.json /app/config/typed_config_manifest.json
COPY src /app/src
COPY tests /app/tests
COPY alembic /app/alembic
COPY alembic.ini /app/alembic.ini
COPY docker-entrypoint.sh /app/docker-entrypoint.sh

ENV NODE_ENV=production

# Persisted data directory (secrets + shadow config)
RUN mkdir -p /data && chmod +x /app/docker-entrypoint.sh

EXPOSE 8001

CMD ["/app/docker-entrypoint.sh"]
