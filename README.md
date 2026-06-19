<p align="center">
  <a href="https://github.com/codefrydev/WebsiteProfiling">
    <img src="docs/assets/readme-banner.png" alt="Site Audit — Developer-friendly SEO crawl and audit" width="920">
  </a>
</p>

<p align="center">
  <strong>Site Audit — Developer-friendly SEO crawl &amp; audit</strong><br>
  <sub>Self-hosted technical SEO for developers — your infrastructure, your data.</sub>
</p>

<p align="center">
  <a href="https://github.com/codefrydev/WebsiteProfiling/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/codefrydev/WebsiteProfiling/ci.yml?branch=master&label=CI&logo=github" alt="CI status"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <a href="https://github.com/codefrydev/WebsiteProfiling"><img src="https://img.shields.io/badge/open%20source-yes-brightgreen.svg" alt="Open source"></a>
  <a href="https://github.com/codefrydev/WebsiteProfiling/stargazers"><img src="https://img.shields.io/github/stars/codefrydev/WebsiteProfiling?style=social" alt="GitHub stars"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-000?logo=next.js&logoColor=white" alt="Next.js">
  <img src="https://img.shields.io/badge/Python-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?logo=postgresql&logoColor=white" alt="PostgreSQL">
  <img src="https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white" alt="Docker">
</p>

<p align="center">
  <a href="#getting-started">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#scope-and-limitations">Limitations</a> ·
  <a href="#architecture">Structure</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="#documentation">Docs</a> ·
  <a href="#license">License</a>
</p>

---

# Site Audit

**Developer-friendly SEO audit platform** — open-source crawl and technical audit tooling built with **Next.js, Python, and PostgreSQL**.

## Overview

Site Audit is a **developer-friendly SEO audit** tool: self-hosted, transparent, and built for engineers who want crawl data, issue reports, and integrations in their own stack — not another opaque SaaS dashboard. It runs on your infrastructure, stores data in PostgreSQL, and produces actionable technical reports with no subscription tiers or gated exports.

**Use cases**

- Developer-friendly SEO audits for owned or client properties
- Crawl analysis with static and JavaScript rendering
- Content writing and optimization with live SEO scoring
- Search Console, GA4, and Bing Webmaster integration
- Agency portfolio management and run comparison
- Optional AI-assisted analysis over audit data via MCP-compatible tools

## Scope and limitations

Site Audit focuses on **honest, self-hosted technical SEO**. It is not a drop-in replacement for every paid SaaS data product.

- **No live backlink index** — Backlink tools read **Google Search Console Links CSV imports** (and optional third-party CSV overlays). There is no Ahrefs, Semrush, Moz, or Majestic API integration.
- **No daily rank tracking** — Keyword positions come from **GSC snapshots** on your connected property, not a proprietary SERP tracker or rank-history database.
- **Live AI citation checks are opt-in** — GEO/AEO tools default to **on-site heuristics** (no API required). Optional live checks via `check_ai_citations_live` require a BYO API key (`PERPLEXITY_API_KEY`, `OPENAI_API_KEY`, etc.) and explicit `opt_in=true`; they are not called automatically.
- **No third-party keyword volume APIs** — Keyword explorer uses **on-site frequency plus Search Console**; difficulty and SERP feature overlays are estimated unless you supply your own data.
- **No managed cloud** — You run it (Docker or local dev). This repo is not a hosted multi-tenant SaaS.
- **No substitute for Google access** — Search Console, Analytics, and Bing Webmaster require **your credentials**; missing or stale integrations show empty states with provenance labels, not fabricated metrics.
- **Not a ranking guarantee** — Category scores (0–100) are **internal audit scores**, not Google rankings or predicted traffic impact.

**Planned extensions** (not yet shipped): full backlink index beyond GSC import, SERP rank tracking beyond GSC snapshots. See [docs/MCP.md](docs/MCP.md#future-pipeline-items).

## Features

<table>
  <tr>
    <td align="center" width="25%">
      <img src="docs/assets/icon-crawl.svg" width="48" alt=""><br>
      <strong>Site crawl</strong><br>
      <sub>Static &amp; JS rendering, sitemap export, crawl maps</sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/assets/icon-audit.svg" width="48" alt=""><br>
      <strong>Technical audit</strong><br>
      <sub>Issues, Lighthouse, accessibility (axe), on-page checks</sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/assets/icon-integrations.svg" width="48" alt=""><br>
      <strong>Integrations</strong><br>
      <sub>Google Search Console, GA4, Bing Webmaster</sub>
    </td>
    <td align="center" width="25%">
      <img src="docs/assets/icon-self-hosted.svg" width="48" alt=""><br>
      <strong>Self-hosted</strong><br>
      <sub>Docker or local dev — your data stays yours</sub>
    </td>
  </tr>
</table>

Also included: **AI chat** over audit data (optional), **Content studio** (write &amp; optimize with live SEO scoring), **340 MCP tools** (local stdio or remote Streamable HTTP), image SEO, GEO/AEO readiness, keyword explorer (GSC + on-site), backlinks (GSC Links import), compare runs, and portfolio management for agencies.

<img src="docs/assets/social-preview.png" alt="Site Audit — developer-friendly SEO audit preview" width="100%">

## Architecture

```
WebsiteProfiling/
├── src/website_profiling/     # Python audit engine (CLI: python -m src)
│   ├── crawl/                 # Crawler, fetchers, JS rendering
│   ├── reporting/             # Report builder, issue categories
│   ├── analysis/              # On-page / local analysis
│   ├── lighthouse/            # Lighthouse runner
│   ├── integrations/          # Google Search Console, GA4, Bing, CrUX
│   ├── llm/                   # AI enrich + chat agent
│   ├── tools/                 # Exports, audit query tools, MCP helpers
│   ├── mcp/                   # MCP server (stdio + remote HTTP, domain bundles)
│   ├── db/                    # PostgreSQL storage layer
│   ├── commands/              # CLI subcommands
│   ├── cli.py                 # Pipeline entrypoint
│   └── config.py              # Config load (DB + shadow file)
├── web/                       # Next.js UI
│   ├── app/                   # App Router pages + /api routes
│   ├── src/components/        # React UI components
│   ├── src/views/             # Report views (overview, links, issues, …)
│   ├── src/server/            # Server-side DB, pipeline jobs, config I/O
│   └── public/                # Static assets (logo, favicon)
├── alembic/versions/          # PostgreSQL schema migrations
├── tests/                     # pytest suite + fixtures
├── docs/                      # Glossary, MCP, ops, brand assets
├── scripts/                   # local-run.sh, local-test.sh helpers
├── .github/workflows/         # CI (Python + web + browser crawl)
├── docker-compose.yml         # Dev stack (Postgres + web)
├── docker-compose.prod.yml    # Production stack (requires AUTH_SECRET)
├── docker-compose.pull.yml    # Pre-built WEB_IMAGE
├── Dockerfile                 # Production image
├── local-run                  # Dev setup & start script
├── local-test                 # Full test suite (CI parity)
├── requirements.txt           # Python dependencies
└── pipeline-config.example.txt
```


| Path                                  | Purpose                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `src/website_profiling/`              | Crawl, analyze, report, Lighthouse, integrations, AI — run via `python -m src` |
| `web/app/api/`                        | REST APIs: report data, pipeline runs, chat (SSE), Google/Bing sync            |
| `web/src/lib/pipelineConfigSchema.ts` | Audit settings schema (UI ↔ PostgreSQL)                                        |
| `alembic/versions/`                   | Database migrations — run `./local-run migrate`                                |
| `tests/`                              | Backend tests; `./local-test browser` for Playwright crawl integration         |
| `docs/MCP.md`                         | MCP server setup for IDE and agent integrations                                |
| `data/`                               | Local secrets and shadow `pipeline-config.txt` (gitignored)                    |


For layout details and common development patterns, see [AGENT.md](AGENT.md).

## Getting started

### Docker

Build and run from source:

```bash
docker compose up --build
```

Open [http://localhost:3000/home](http://localhost:3000/home).

Production deployment: `docker-compose.prod.yml` — set `POSTGRES_USER`, `POSTGRES_PASSWORD`, and `AUTH_SECRET`. Pre-built images: `docker-compose.pull.yml` (`WEB_IMAGE`).

### Local development

```bash
./local-run setup   # First time: Postgres, Python venv, migrations, npm deps
./local-run         # Start DB + Next.js dev server → http://localhost:3000/home
./local-run db      # Postgres only (no app)
./local-run migrate # Apply Alembic migrations only
./local-run stop    # Stop Postgres container
```

Default local `DATABASE_URL`: `postgres://postgres:dev@127.0.0.1:5432/website_profiling` (Docker Compose dev stack uses `profiling:profiling`).

`requirements.txt` pins direct Python dependencies to versions verified by `./local-test python`. Re-run the full test suite after intentional upgrades.

### Pipeline job timeouts


| Setting                       | Default   | Description                                    |
| ----------------------------- | --------- | ---------------------------------------------- |
| `PIPELINE_JOB_STALE_HOURS`    | 1 hour    | Reconciles stuck `running` rows                |
| `PIPELINE_JOB_ORPHAN_MINUTES` | 5 minutes | Clears orphan jobs with no live server process |


Increase `PIPELINE_JOB_STALE_HOURS` for crawls that routinely exceed one hour.

### Testing

```bash
./local-test              # Python + web (matches CI python and web jobs)
./local-test python       # Backend: three 100% coverage gates + browser pytest + CLI smoke
./local-test browser      # JS crawl integration tests (skips if Chromium unavailable)
./local-test web          # Frontend: typecheck, lint, vitest
./local-test quick        # Fast loop; requires DB already running (no coverage gate)
./local-test all --no-cov # Full run without pytest coverage gate
```

CI also runs a **Docker** job (image build, browser pytest in container, compose smoke). See [.github/workflows/ci.yml](.github/workflows/ci.yml).

## Configuration

### Integrations

Connect Google Search Console and Analytics via **Integrations** (gear icon) in the application UI.

### Google Ads Keyword Planner (optional)

Adds official search volume and competition data from the Google Ads API to the Keywords explorer. Requires:

1. A [Google Ads developer token](https://developers.google.com/google-ads/api/docs/first-call/dev-token) (Basic access is sufficient for keyword research).
2. A Google Ads manager account customer ID (login customer ID).
3. An existing Google OAuth connection (via Integrations) — users must re-consent after the `adwords` scope is added.

In **Integrations → Google Ads Keyword Planner**, enter the developer token and login customer ID. Then enable `enable_google_keyword_planner` in audit settings.

The overlay enriches keywords that have no Search Console impressions with `planner_avg_monthly_searches` and `planner_competition`, labelled "Google Keyword Planner" to distinguish them from real GSC data. GSC-ranked keywords are never overwritten. Set `enable_keyword_forecast = true` to additionally attach click/conversion forecasts to the top 50 keywords.

### JavaScript crawl (optional)

In Audit settings, set **Crawl rendering** to `javascript` (always headless Chromium) or `auto` (static first, browser when SPA heuristics match). Requires Playwright from `requirements.txt` and Chromium on `PATH` or `CHROME_PATH` (included in Docker). The UI preflights via `GET /api/crawl/browser-status` before runs when JS or auto mode is selected.

### AI chat (optional)

Ask questions about audit data at [http://localhost:3000/chat](http://localhost:3000/chat). Enable a provider under **Run audit → AI settings** (`llm_enabled`, provider, model). `./local-run setup` installs Python deps from `requirements.txt` (including `httpx`, OpenAI, Anthropic, and Groq SDKs; Gemini uses `httpx` via REST).


| Provider                   | Notes                                                                                                                                                                      |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Ollama**                 | Local daemon at `http://127.0.0.1:11434`. Chat UI lists installed models plus the live Ollama cloud catalog. Native tool calling when supported; ReAct fallback otherwise. |
| **OpenAI** / **Anthropic** | API key in AI settings or env (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`); native tool calling with streaming.                                                                 |
| **Google Gemini**          | API key in AI settings or `GEMINI_API_KEY`; REST via `httpx`.                                                                                                              |
| **Groq**                   | API key in AI settings or `GROQ_API_KEY`; official Groq Python SDK; native tool calling with streaming. Default model `openai/gpt-oss-120b`.                               |


The agent uses the same **342 read-only audit tools** as the MCP server ([docs/MCP.md](docs/MCP.md)), with **dynamic routing** (~45 tools per turn). Responses stream over SSE (`POST /api/chat`). Sessions persist per property (`chat_sessions` / `chat_messages`).

**Read-only SQL chat tool (opt-in):** Set `CHAT_SQL_TOOL_ENABLED=true` to expose `get_sql_schema` and `run_sql_query` to the LLM. The agent can then answer arbitrary data questions by generating and executing a single read-only SELECT. Queries are validated by a four-layer guard (regex pre-filter → `sqlglot` AST + table allowlist → `BEGIN TRANSACTION READ ONLY` → optional least-privilege DB role); DELETE/UPDATE/INSERT/DDL and non-allowlisted tables are always blocked. In multi-property deployments, scope-binding CTEs are automatically injected to enforce tenant isolation. See [docs/OPS.md](docs/OPS.md#read-only-sql-chat-tool) for setup including the recommended `audit_readonly` Postgres role and optional RLS configuration.

### Content studio (optional, Experimental)

Write and optimize content at [http://localhost:3000/write](http://localhost:3000/write) with **live SEO scoring** from Search Console and on-page heuristics. Drafts persist per property; an optional AI assist (same providers as AI chat) drafts and rewrites copy. Backed by `/api/content-drafts`, `/api/content/score`, and `/api/content/analyze`.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and pull request guidelines.

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards
- [SECURITY.md](SECURITY.md) — report vulnerabilities privately

## Documentation


| Document                                               | Description                                |
| ------------------------------------------------------ | ------------------------------------------ |
| [docs/README.md](docs/README.md)                       | Documentation index and brand assets       |
| [AGENT.md](AGENT.md)                                   | Repository layout and development commands |
| [docs/GLOSSARY.md](docs/GLOSSARY.md)                   | UI terminology                             |
| [docs/COMPANY_STANDARDS.md](docs/COMPANY_STANDARDS.md) | Data and security policy                   |
| [docs/MCP.md](docs/MCP.md)                             | MCP server setup                           |
| [docs/OPS.md](docs/OPS.md)                             | Scheduled audits, alerts, production ops   |


## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=codefrydev/WebsiteProfiling&type=Date)](https://star-history.com/#codefrydev/WebsiteProfiling&Date)

## License

Copyright © 2026 [codefrydev](https://github.com/codefrydev). Released under the [MIT License](LICENSE).