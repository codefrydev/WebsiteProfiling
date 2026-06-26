# ReportService

Internal .NET microservice for **report payload build** and **full-audit orchestration**.

- **Port:** 8094 (`REPORT_SERVICE_URL`)
- **Stack:** ASP.NET Core 10, Npgsql
- **Consumers:** Python worker (report phase), BFF (compare/dashboard proxies)

## Run locally

```bash
cd services/ReportService
DATABASE_URL=postgres://profiling:profiling@127.0.0.1:5432/website_profiling \
  FASTAPI_URL=http://127.0.0.1:8001 \
  INTEGRATIONS_SERVICE_URL=http://127.0.0.1:8093 \
  REPORT_SERVICE_USE_PYTHON_BRIDGE=1 \
  REPORT_SERVICE_VALIDATE_NATIVE=1 \
  ASPNETCORE_URLS=http://127.0.0.1:8094 \
  dotnet run --project src/ReportService.Api --no-launch-profile
```

Or use `./local-run` from the repo root (starts ReportService with `REPORT_SERVICE_VALIDATE_NATIVE=1` by default).

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres (crawl rows, edges, lighthouse summaries, report metadata) |
| `FASTAPI_URL` | Python bridge when `REPORT_SERVICE_USE_PYTHON_BRIDGE=1` |
| `INTEGRATIONS_SERVICE_URL` | Google/keyword/GSC links snapshots for native build (`GET /internal/integrations/report/enrichment`) |
| `REPORT_SERVICE_USE_PYTHON_BRIDGE` | `1` (default) delegates build to Python; `0` uses native C# only |
| `REPORT_SERVICE_VALIDATE_NATIVE` | `1` in local dev — runs native assembler alongside bridge for parity checks |

## Native vs Python bridge

| Mode | When | Notes |
|------|------|-------|
| **Bridge** (`REPORT_SERVICE_USE_PYTHON_BRIDGE=1`) | Default in Docker and `./local-run` | Calls Python `reporting/builder.py`; production-safe today |
| **Native** (`REPORT_SERVICE_USE_PYTHON_BRIDGE=0`) | Opt-in | C# `NativeReportBuilder` assembles payload from Postgres + IntegrationsService |

**Native build includes (current):** category builders (8 slices), links list, content analytics/URLs, charts, graph/PageRank, link edges, DB write (`report_payload` + `audit_health_snapshots`), Google enrichment via IntegrationsService, issue impact, search performance category, indexation coverage, competitor link gap, passive security scan, lighthouse global summary. **No ML enrichment at build time** (empty duplicates/language/ML bundles).

**Still Python-only or partial in native mode:** `site_level` HTTP fetch, contact intelligence, active security probes, keyword opportunities, image inventory, semantic clusters, subdomain inventory, rich-results validation, full `lighthouse_by_url` merge with audit JSON.

Service-to-service Google reads go **ReportService → IntegrationsService** (internal HTTP), not through the BFF. The BFF remains the browser gateway only.

## Endpoints

| Route | Purpose |
|-------|---------|
| `GET /health` | Health check |
| `POST /internal/report/build` | Build report payload (bridge or native) |
| `POST /internal/pipeline/run` | Orchestrate crawl + lighthouse then report |
| `GET/POST/PUT/DELETE /api/dashboards/*` | Proxy to FastAPI (strangler) |
| `POST /api/compare/export` | Proxy to FastAPI (strangler) |

## Key paths

```
src/ReportService.Application/Build/
  NativeReportBuilder.cs
  NativeReportPayloadAssembler.cs
  IndexationCoverageBuilder.cs, SecurityScanBuilder.cs, CompetitorLinkGapBuilder.cs
  Categories/
src/ReportService.Application/Integrations/
  IntegrationsReportDataClient.cs
```

## Tests

```bash
dotnet test ReportService.slnx
```

Included in `./local-test` (dotnet gate) and CI (`.github/workflows/ci.yml`).
