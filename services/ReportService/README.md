# ReportService

Internal .NET microservice for report payload build and full-audit orchestration.

- **Port:** 8094 (`REPORT_SERVICE_URL`)
- **Stack:** ASP.NET Core 10, Npgsql
- **Consumers:** Python worker (report phase), BFF (`REPORT_ROUTES` for compare/dashboards)

## Run locally

```bash
cd services/ReportService
DATABASE_URL=postgres://profiling:profiling@127.0.0.1:5432/website_profiling \
  FASTAPI_URL=http://127.0.0.1:8001 \
  INTEGRATIONS_SERVICE_URL=http://127.0.0.1:8093 \
  REPORT_SERVICE_USE_PYTHON_BRIDGE=1 \
  ASPNETCORE_URLS=http://127.0.0.1:8094 \
  dotnet run --project src/ReportService.Api --no-launch-profile
```

Or use `./local-run` from the repo root.

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (read crawl/report metadata during native build) |
| `FASTAPI_URL` | Python bridge for report build + compare/dashboard proxies |
| `REPORT_SERVICE_USE_PYTHON_BRIDGE` | `1` (default) delegates build to Python; `0` uses native C# (enrichment stubs for Google/security/ML) |
| `INTEGRATIONS_SERVICE_URL` | Post-report keyword enrich; native report Google/keyword/GSC reads |

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET /health` | Health check |
| `POST /internal/report/build` | Build report payload (bridge or native) |
| `POST /internal/pipeline/run` | Orchestrate crawl+lighthouse then report |
| `GET/POST/PUT/DELETE /api/dashboards/*` | Proxy to FastAPI (strangler) |
| `POST /api/compare/export` | Proxy to FastAPI (strangler) |

## Tests

```bash
dotnet test ReportService.slnx
```
