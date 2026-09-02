# CoreService

Unified .NET microservice combining **Report build & orchestration**, **Data reads & exports**, and **Google/Bing integrations** for Site Audit.

CoreService was formed by consolidating `Data`, `ReportService`, and `IntegrationsService` into a single cohesive service, reducing infrastructure operational overhead and project proliferation while preserving bounded context modularity.

## Bounded Contexts

Inside `services/CoreService/src/CoreService.Api/`:

1. **Report & Pipeline Orchestration** (`Application/Build`, `Application/Pipeline`, `Domain/Report`):
   - Report generation and native metric assembler
   - Crawl orchestration and pipeline worker
   - Compare and dashboard analytics
   - Health score calculation

2. **Data Reads & Exports** (`DataApplication`, `Domain/Data`, `Rendering`):
   - Direct Postgres read operations (portfolio, crawl payloads, issue status, filters)
   - PDF export (QuestPDF) and Excel workbook export (ClosedXML)
   - CSV, JSON, and sitemap exports
   - Content studio scores and drafts

3. **External Integrations** (`IntegrationsApplication`, `Domain/Integrations`, `Providers/Google`):
   - Google Search Console (GSC) and Google Analytics 4 (GA4) data fetching
   - Google OAuth token exchange and callback lifecycle
   - Live URL inspection and indexation status
   - Keyword enrichment and rank tracking

## Run locally

```bash
cd services/CoreService
export DATABASE_URL=postgres://profiling:profiling@127.0.0.1:5432/website_profiling
export FASTAPI_URL=http://127.0.0.1:8096
export AI_SERVICE_URL=http://127.0.0.1:8092
dotnet run --project src/CoreService.Api
```

Service listens on **http://localhost:8094**. Swagger UI in Development: **http://localhost:8094/docs**.

`./local-run` starts CoreService automatically. The BFF proxies client requests to CoreService via `CORE_SERVICE_URL` (with `DATA_SERVICE_URL`, `INTEGRATIONS_SERVICE_URL`, and `REPORT_SERVICE_URL` aliased).

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CORE_SERVICE_URL` | `http://127.0.0.1:8094` | Base URL of CoreService |
| `DATABASE_URL` | (required) | PostgreSQL connection string |
| `FASTAPI_URL` | `http://127.0.0.1:8096` | Internal Python FastAPI bridge URL |
| `AI_SERVICE_URL` | `http://127.0.0.1:8092` | Internal AiService URL |
| `AUTH_SECRET` | — | Secret key for signing OAuth session states |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8090/api/integrations/google/callback` | OAuth redirect URI |
| `REPORT_SERVICE_WORKER_ENABLED` | `1` | Enable background C# pipeline job runner |
| `REPORT_SERVICE_VALIDATE_NATIVE` | `1` | Validate native C# report against Python bridge |

## Testing

```bash
dotnet test services/CoreService/tests/CoreService.Tests/CoreService.Tests.csproj
```
All 262 unit and integration tests run in ~7-8 seconds against in-memory mocks and WebApplicationFactory.
