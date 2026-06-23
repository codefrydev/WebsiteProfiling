# FileService

Standalone .NET service for file generation and file-related operations: **audit report PDF export** ([QuestPDF](https://www.questpdf.com/)) and **crawl workbook Excel export** (ClosedXML).

Python owns crawl data and CSV/JSON exports. FileService renders PDF and Excel workbooks from the report HTTP API — **no direct Postgres access** (no Npgsql, EF, or `DATABASE_URL`).

## Run locally

Prerequisites: [.NET SDK 10+](https://dotnet.microsoft.com/download), Site Audit report API on port 8001 (started by `./local-run` or Docker `web` service).

```bash
cd services/FileService
export REPORT_API_URL=http://127.0.0.1:8001
dotnet run --project src/FileService.Api
```

Service listens on **http://localhost:8080** (`ASPNETCORE_URLS` / `appsettings.json`).

In **Development**, Swagger UI is at **http://localhost:8080/docs** and the OpenAPI JSON at **http://localhost:8080/swagger/v1/swagger.json**.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `REPORT_API_URL` | `http://127.0.0.1:8001` | Base URL for report payload, meta, and app-settings HTTP API |
| `ASPNETCORE_URLS` | `http://127.0.0.1:8080` | Bind address (Docker sets `http://+:8080`) |

## Upstream HTTP contract

Routes on `REPORT_API_URL`:

| Route | Purpose |
|-------|---------|
| `GET /api/report/payload?reportId=` | Report JSON for PDF/workbook |
| `GET /api/report/meta` | Domain → report list |
| `GET /api/app-settings?key=` | Agency branding (optional) |

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
| `branding` | `true` | Load agency name/logo/subtitle from report API app-settings |
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
dotnet test
```

Fixtures: `tests/FileService.Tests/fixtures/minimal-payload.json`, `full-payload.json`.
