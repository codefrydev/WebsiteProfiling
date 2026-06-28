# FileService

Standalone .NET service for file generation and file-related operations: **audit report PDF export** ([QuestPDF](https://www.questpdf.com/)) and **crawl workbook Excel export** (ClosedXML).

Python owns crawl data and CSV/JSON exports. FileService renders PDF and Excel workbooks from the report HTTP API — **no direct Postgres access** (no Npgsql, EF, or `DATABASE_URL`).

## Run locally

Prerequisites: [.NET SDK 10+](https://dotnet.microsoft.com/download), Site Audit report API on port 8096 (started by `./local-run` or Docker `web` service).

```bash
cd services/FileService
export REPORT_API_URL=http://127.0.0.1:8096
dotnet run --project src/FileService.Api
```

Service listens on **http://localhost:8097** (`ASPNETCORE_URLS` / `appsettings.json`).

In **Development**, Swagger UI is at **http://localhost:8097/docs** and the OpenAPI JSON at **http://localhost:8097/swagger/v1/swagger.json**.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REPORT_API_URL` | `http://127.0.0.1:8096` | Base URL for report payload, meta, and ui-preferences HTTP API |
| `ASPNETCORE_URLS` | `http://127.0.0.1:8097` | Bind address (Docker sets `http://+:8097`) |

## Upstream HTTP contract

Routes on `REPORT_API_URL`:

| Route | Purpose |
|-------|---------|
| `GET /api/report/payload?reportId=` | Report JSON for PDF/workbook |
| `GET /api/report/meta` | Domain → report list |
| `GET /api/ui-preferences` | Agency branding (`brand_name`, `brand_subtitle`, `brand_logo_url`) |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/v1/reports/{reportId}/pdf` | PDF for report ID |
| GET | `/v1/reports/by-domain/{domain}/pdf` | Resolve domain → latest report → PDF |
| GET | `/v1/reports/{reportId}/workbook` | Excel crawl workbook for report ID |
| GET | `/v1/reports/by-domain/{domain}/workbook` | Resolve domain → latest report → workbook |

**PDF query params**

| Param | Default | Description |
|-------|---------|-------------|
| `profile` | `standard` | `executive`, `standard`, `full`, or `premium` |
| `branding` | `true` | Load agency name/logo/subtitle from `GET /api/ui-preferences` |
| `disposition` | `attachment` | `inline` for iframe preview, `attachment` for download |

**Workbook query params**

| Param | Default | Description |
|-------|---------|-------------|
| `disposition` | `attachment` | `inline` or `attachment` |

Workbook sheets (when data exists in payload): Internal URLs, Links, Redirects, Issues, Custom Fields.

## PDF profiles

| Profile | Contents |
|---------|----------|
| **executive** | Branded cover, score dashboard, executive summary, top issues |
| **standard** | Cover, TOC, score dashboard, audit snapshot, findings, appendix |
| **full** | Standard sections + Lighthouse, GSC, GA4, security, content, indexation (when data exists) |
| **premium** | Full-bleed section dividers, enhanced findings with GSC columns, same optional analytics chapters as full |

Layout code lives under `src/FileService.Rendering/Sections/` and `Composition/SectionRegistry.cs`.

## QuestPDF license

QuestPDF Community License applies for companies with annual revenue under USD 1M. Review [QuestPDF licensing](https://www.questpdf.com/license/) before production deployment.

Use the [QuestPDF Companion](https://www.questpdf.com/companion/) app for live layout iteration during development.

## Tests

```bash
# From repo root — all .NET services:
dotnet test services/WebsiteProfiling.slnx

# Or from services/:
cd services && dotnet test WebsiteProfiling.slnx

# This service only:
dotnet test services/FileService/tests/FileService.Tests/FileService.Tests.csproj
```

Fixtures: `tests/FileService.Tests/fixtures/minimal-payload.json`, `full-payload.json`.
