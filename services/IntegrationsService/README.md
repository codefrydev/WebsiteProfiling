# IntegrationsService

Internal .NET microservice for Google Search Console, GA4, Bing sync, and keyword enrichment.

- **Port:** 8093 (`INTEGRATIONS_SERVICE_URL`)
- **Stack:** ASP.NET Core 10, EF Core + Npgsql (Postgres), Google API client libraries
- **Consumers:** BFF (browser-facing `/api/*` proxy), Python worker/CLI via `INTEGRATIONS_SERVICE_URL`

## Run locally

```bash
cd services/IntegrationsService
DATABASE_URL=postgres://profiling:profiling@127.0.0.1:5432/website_profiling \
  FASTAPI_URL=http://127.0.0.1:8001 \
  USE_FASTAPI_PYTHON_BRIDGE=1 \
  ASPNETCORE_URLS=http://127.0.0.1:8093 \
  dotnet run --project src/IntegrationsService.Api --no-launch-profile
```

Or use `./local-run` / `./local-prod` from the repo root (starts IntegrationsService on 8093 when `dotnet` is available).

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (property credentials, `google_data`) |
| `FASTAPI_URL` | Python bridge for keyword enrich + GSC link import when `USE_FASTAPI_PYTHON_BRIDGE=1` |
| `USE_FASTAPI_PYTHON_BRIDGE` | `1` in Docker/local prod — IntegrationsService image has no Python |
| `AUTH_SECRET` | Required when `ASPNETCORE_ENVIRONMENT=Production` (OAuth state signing) |
| `GOOGLE_REDIRECT_URI` | OAuth callback (default dev: `http://localhost:8090/api/integrations/google/callback`) |
| `APP_PUBLIC_URL` | Post-login redirect base (default dev: `http://localhost:3000`) |

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET /health` | Health check |
| `POST /internal/integrations/google/fetch` | Worker fetch (stores `google_data`) |
| `POST /internal/integrations/keywords/enrich` | Pipeline keyword enrichment |
| `GET /internal/integrations/report/enrichment?propertyId=` | Report build: latest Google/keyword/GSC links snapshots |
| `GET/POST /api/properties/{id}/google/*` | Property Google config, credentials, test, disconnect |
| `GET/POST /api/integrations/google/*` | OAuth auth/callback, status, page-data, page-live, url-inspection, keywords |
| `POST /api/integrations/bing/sync` | Bing Webmaster sync |

BFF routes Google/Bing traffic via `INTEGRATIONS_ROUTES` (see `services/Bff/`). Property `/google/*` paths are auto-proxied when `INTEGRATIONS_SERVICE_URL` is set.

Swagger UI: `/docs` (Development only).

## Tests

```bash
# From repo root — all .NET services:
dotnet test services/WebsiteProfiling.slnx

# Or from services/:
cd services && dotnet test WebsiteProfiling.slnx

# This service only:
dotnet test services/IntegrationsService/tests/IntegrationsService.Tests/IntegrationsService.Tests.csproj
```

## Docker

Included in `docker-compose.yml`, `docker-compose.prod.yml`, and `docker-compose.pull.yml`. FastAPI runs with `DEPRECATE_PYTHON_INTEGRATIONS=1`; worker uses `INTEGRATIONS_SERVICE_URL=http://integrations:8093`.
