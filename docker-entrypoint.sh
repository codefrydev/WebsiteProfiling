#!/bin/sh
set -e
cd /app
/opt/venv/bin/alembic upgrade head
cd /app/web && exec npm run start -- -H 0.0.0.0 -p 3000
