#!/bin/sh
# Regenerate the typed FastAPI client (src/Bff.Api/Application/Generated/FastApiClient.g.cs)
# from the committed OpenAPI spec (web/openapi.json).
#
# Prerequisite (one-time):  dotnet tool install -g NSwag.ConsoleCore
# The spec itself is produced by:  python scripts/generate_openapi.py  (run from the repo).
set -e
cd "$(dirname "$0")"
nswag run nswag.json
echo "Generated src/Bff.Api/Application/Generated/FastApiClient.g.cs"
