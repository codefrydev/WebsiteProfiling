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
| [services/AiService/README.md](../services/AiService/README.md) | Developers | AI chat, secrets, LLM config, MCP, enrichment (port 8092) |
| [services/IntegrationsService/README.md](../services/IntegrationsService/README.md) | Developers | Google/Bing OAuth, GSC/GA4 fetch, keywords (port 8093) |
| [services/FileService/README.md](../services/FileService/README.md) | Developers / operators | PDF and Excel workbook export service |
| `services/Data/` | Developers | .NET read service — report payloads, portfolio, issue status, saved filters (port 8091) |

---

## API routing (browser)

All `/api/*` calls from the SPA go to the **BFF** (`:8090`). The BFF forwards subsets to:

| Upstream | Examples |
|----------|----------|
| **FastAPI** (`:8001`) | `/api/run`, `/api/pipeline-config`, crawl, properties |
| **IntegrationsService** (`:8093`) | `/api/integrations/google/*`, `/api/integrations/bing/*`, property Google config |
| **AiService** (`:8092`) | `/api/chat`, `/api/secrets`, `/api/llm-config`, MCP-related APIs |
| **Data** (`:8091`) | Report payload reads, portfolio, issue status, saved filters |
| **FileService** (`:8080`) | PDF and Excel export |

See [AGENT.md](../AGENT.md) for the full route split and [services/AiService/README.md](../services/AiService/README.md) for `AI_ROUTES`.

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
| [pipeline-config.example.txt](../pipeline-config.example.txt) | Pipeline configuration key reference |

## Agent discovery files

These files help AI coding agents (Cursor, Claude Code, Cline) work with this codebase:

| File | Description |
|------|-------------|
| [AGENTS.md](../AGENTS.md) | Short entry-point for AI coding agents — points to AGENT.md |
| [AGENT.md](../AGENT.md) | Full developer/agent reference: APIs, edit targets, footguns |
