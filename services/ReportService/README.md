# ReportService

Internal .NET microservice for **report payload build**, **pipeline job orchestration**, and **C# worker loop**.

- **Port:** 8094 (`REPORT_SERVICE_URL`)
- **Stack:** ASP.NET Core 10, Npgsql, FuzzySharp, LanguageIdentification
- **Consumers:** BFF (pipeline jobs, dashboards, compare, crawl UI helpers)

## Run locally

```bash
cd services/ReportService
DATABASE_URL=postgres://profiling:profiling@127.0.0.1:5432/website_profiling \
  INTEGRATIONS_SERVICE_URL=http://127.0.0.1:8093 \
  WEBSITE_PROFILING_ROOT=/path/to/repo \
  PYTHON=/path/to/.venv/bin/python \
  REPORT_SERVICE_USE_PYTHON_BRIDGE=0 \
  REPORT_SERVICE_VALIDATE_NATIVE=1 \
  ASPNETCORE_URLS=http://127.0.0.1:8094 \
  dotnet run --project src/ReportService.Api --no-launch-profile
```

Or use `./local-run` from the repo root (starts ReportService with native build and embedded C# worker).

In **Development**, Swagger UI is at **http://localhost:8094/docs** (OpenAPI JSON at `/swagger/v1/swagger.json`).

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (crawl rows, edges, lighthouse summaries, report metadata, pipeline_jobs) |
| `INTEGRATIONS_SERVICE_URL` | Google/keyword/GSC links snapshots for native build |
| `REPORT_SERVICE_USE_PYTHON_BRIDGE` | `0` (default) native C# build; `1` delegates to removed Python bridge |
| `REPORT_SERVICE_VALIDATE_NATIVE` | `1` in local dev — parity warnings when bridge mode is enabled |
| `REPORT_SERVICE_WORKER_ENABLED` | `1` (default) runs embedded pipeline worker BackgroundService |
| `WEBSITE_PROFILING_ROOT` / `PYTHON` | Repo root and Python executable for crawl/lighthouse subprocesses |
| `FASTAPI_URL` | Optional — only needed if `REPORT_SERVICE_USE_PYTHON_BRIDGE=1` (legacy) |

## Architecture

The **C# worker** polls `pipeline_jobs`, spawns `python -m src crawl|lighthouse` subprocesses, and runs report build in-process via `NativeReportBuilder`.

Browser-facing routes on this service (via BFF `REPORT_ROUTES`):

| Route | Purpose |
|-------|---------|
| `POST /api/run`, `GET /api/jobs/*` | Pipeline job API |
| `GET/POST/PUT/DELETE /api/dashboards/*` | Dashboard CRUD (native) |
| `POST /api/compare/export` | Compare CSV export (native) |
| `GET /api/crawl/*` | Browser status + stored page HTML |
| `POST /api/schedule/check` | Scheduled crawl check stub |
| `POST /internal/report/build` | Report payload build (native) |
| `POST /internal/pipeline/run` | Full-audit orchestration |

## Key paths

```
src/ReportService.Application/Build/
  NativeReportBuilder.cs, LocalEnrichmentBuilder.cs
  SiteLevelBuilder.cs, ContactIntelligenceBuilder.cs, ImageInventoryBuilder.cs
src/ReportService.Application/Pipeline/
  PipelineWorkerBackgroundService.cs, PipelineJobRunner.cs
```

## Tests

```bash
dotnet test services/ReportService/tests/ReportService.Tests/ReportService.Tests.csproj
dotnet test services/WebsiteProfiling.slnx
```

Included in `./local-test` and CI.
