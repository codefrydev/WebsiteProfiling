# Site Audit — Documentation

This directory contains product, integration, and operations documentation for **Site Audit** (repository: WebsiteProfiling), a self-hosted SEO crawl and technical audit platform.

---

## Document index

| Document | Audience | Description |
|----------|----------|-------------|
| [README.md](../README.md) | All users | Product overview, installation, configuration |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contributors | Development setup, testing, pull request guidelines |
| [AGENT.md](../AGENT.md) | Developers | Repository layout, APIs, edit targets |
| [GLOSSARY.md](GLOSSARY.md) | Product / UX | UI terminology mapped to internal keys and data sources |
| [COMPANY_STANDARDS.md](COMPANY_STANDARDS.md) | Agencies / operators | Data classification, crawl scope, security policy |
| [MCP.md](MCP.md) | Integrators | Model Context Protocol server configuration and tool reference |
| [OPS.md](OPS.md) | Operators | Scheduled audits, alerts, migrations, production notes |
| [services/CoreService/README.md](../services/CoreService/README.md) | Developers | Reports, data reads & exports, Google/Bing integrations (port 8094) |
| [services/AiService/README.md](../services/AiService/README.md) | Developers | AI chat, secrets, LLM settings, MCP, enrichment (port 8092) |

---

## API routing (browser)

All `/api/*` calls from the SPA go to the **BFF** (`:8090`). The BFF forwards subsets to:

| Upstream | Examples |
|----------|----------|
| **FastAPI** (`:8096`) | `/api/run`, `/api/jobs/*`, `/api/pipeline-config`, crawl, properties |
| **CoreService** (`:8094`) | Report build & orchestration, data reads (portfolio, payload, issues), PDF/Excel exports, Google/Bing integrations |
| **AiService** (`:8092`) | `/api/chat`, `/api/secrets`, `/api/llm-settings`, MCP-related APIs |

**Internal service-to-service:** ReportService reads Google/keyword snapshots from IntegrationsService (`GET /internal/integrations/report/enrichment`) during native report build — not via the BFF.

See [AGENT.md](../AGENT.md) for the full route split and [services/AiService/README.md](../services/AiService/README.md) for `AI_ROUTES`.

### API documentation (Swagger)

During local development (`./local-run`, `ASPNETCORE_ENVIRONMENT=Development`), each .NET service and the Python bridge expose OpenAPI:

| Service | Port | Swagger UI |
| ------- | ---- | ---------- |
| BFF | 8090 | [http://localhost:8090/docs](http://localhost:8090/docs) |
| AiService | 8092 | [http://localhost:8092/docs](http://localhost:8092/docs) |
| CoreService | 8094 | [http://localhost:8094/docs](http://localhost:8094/docs) |
| Python bridge | 8096 | [http://localhost:8096/docs](http://localhost:8096/docs) |

OpenAPI JSON for .NET services: `/swagger/v1/swagger.json`. See the main [README.md](../README.md#api-documentation-swagger) for details.

---

## Brand assets

Marketing and README assets are stored in [assets/](assets/):

| Asset | Purpose |
|-------|---------|
| `readme-banner.png` | README header banner |
| `seo-feedback-loop.png` | SEO feedback loop diagram (Audit → Report → MCP → Fix → Review) |
| `social-preview.png` | Application screenshot for README and social previews |
| `banner.svg` | Source artwork for the banner |
| `logo.svg`, `logo-icon.svg` | Product logo and icon |
| `icon-crawl.svg`, `icon-audit.svg`, `icon-integrations.svg`, `icon-self-hosted.svg` | Feature icons for README |

---

## Related repository files

| File | Description |
|------|-------------|
| [SECURITY.md](../SECURITY.md) | Vulnerability reporting policy |
| [CODE_OF_CONDUCT.md](../CODE_OF_CONDUCT.md) | Community standards |
| [config/typed_config_manifest.json](../config/typed_config_manifest.json) | Typed PostgreSQL settings schema (pipeline, LLM, secrets, UI prefs) |

## Agent discovery files

These files help AI coding agents (Cursor, Claude Code, Cline) work with this codebase:

| File | Description |
|------|-------------|
| [AGENTS.md](../AGENTS.md) | Short entry-point for AI coding agents — points to AGENT.md |
| [AGENT.md](../AGENT.md) | Full developer/agent reference: APIs, edit targets, footguns |
