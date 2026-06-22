# FileService

Standalone .NET service for file generation and file-related operations. The first capability is **audit report PDF export** via [QuestPDF](https://www.questpdf.com/).

Python/FastAPI remains the source of truth for crawl data and CSV/JSON exports. This service fetches report payloads over HTTP and renders PDFs — no direct Postgres access.

## Run locally

Prerequisites: [.NET SDK 10+](https://dotnet.microsoft.com/download), FastAPI running on port 8001.

```bash
cd services/FileService
export FASTAPI_URL=http://127.0.0.1:8001
dotnet run --project src/FileService.Api
```

Service listens on **http://localhost:8080** (`ASPNETCORE_URLS` / `appsettings.json`).

In **Development**, Swagger UI is at **http://localhost:8080/docs** and the OpenAPI JSON at **http://localhost:8080/swagger/v1/swagger.json**.

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FASTAPI_URL` | `http://127.0.0.1:8001` | FastAPI base URL for report data and app-settings |
| `ASPNETCORE_URLS` | `http://127.0.0.1:8080` | Bind address (Docker sets `http://+:8080`) |

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness |
| GET | `/v1/reports/{reportId}/pdf` | PDF for report ID |
| GET | `/v1/reports/by-domain/{domain}/pdf` | Resolve domain → latest report → PDF |

**Query params**

| Param | Default | Description |
|-------|---------|-------------|
| `profile` | `standard` | `executive`, `standard`, `full`, or `premium` |
| `branding` | `true` | Load agency name/logo/subtitle from FastAPI app-settings |
| `disposition` | `attachment` | `inline` for iframe preview, `attachment` for download |

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
