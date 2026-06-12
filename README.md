<p align="center">
  <a href="https://github.com/codefrydev/WebsiteProfiling">
    <img src="docs/assets/readme-banner.png" alt="Site Audit — Open Source SEO Crawl &amp; Audit" width="920">
  </a>
</p>

<p align="center">
  <strong>Site Audit — Open Source SEO Crawl &amp; Audit</strong><br>
  <sub>Free, self-hosted — no vendor paywalls.</sub>
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
  <a href="#quick-start">Quick start</a> ·
  <a href="#features">Features</a> ·
  <a href="#project-structure">Structure</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="#docs">Docs</a> ·
  <a href="#license">License</a>
</p>

---

# Site Audit

**Open Source SEO Crawl & Audit** — self-hosted UI built with **Next.js + Python + PostgreSQL**.

Repository: [codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling)

## Overview

**Why this project** — Most site-audit and SEO tools are paid, limited, or built to upsell: paywalls, capped crawls, teaser scores, and “subscribe to see how to fix this.” Many free options give shallow or unreliable reports that push you toward a paid plan instead of real answers.

**Goal** — A free, self-hosted audit you control: crawl your sites, see honest technical SEO issues, connect Search Console and Analytics when you want, and export reports for clients — without a vendor sitting between you and the data.

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
      <sub>Issues, Lighthouse, on-page checks, workbooks</sub>
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

Also included: **AI chat** over audit data (optional), **221 MCP tools**, keyword explorer, backlinks, compare runs, and portfolio management for agencies.

<p align="center">
  <img src="docs/assets/social-preview.png" alt="Site Audit preview" width="640">
</p>

## Project structure

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
│   ├── mcp/                   # MCP server (221 read-only tools)
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
├── Dockerfile                 # Production image
├── local-run                  # Dev setup & start script
├── local-test                 # Full test suite (CI parity)
├── requirements.txt           # Python dependencies
└── pipeline-config.example.txt
```

| Path | Purpose |
|------|---------|
| `src/website_profiling/` | Crawl, analyze, report, Lighthouse, integrations, AI — run via `python -m src` |
| `web/app/api/` | REST APIs: report data, pipeline runs, chat (SSE), Google/Bing sync |
| `web/src/lib/pipelineConfigSchema.ts` | Audit settings schema (UI ↔ PostgreSQL) |
| `alembic/versions/` | Database migrations — run `./local-run migrate` |
| `tests/` | Backend tests; `./local-test browser` for Playwright crawl integration |
| `docs/MCP.md` | MCP server setup for IDE / agent integrations |
| `data/` | Local secrets + shadow `pipeline-config.txt` (gitignored) |

For deeper layout notes and edit targets, see [AGENT.md](AGENT.md).

## Quick start

**Docker (build from source)**

```bash
docker compose up --build
```

Open [http://localhost:3000/home](http://localhost:3000/home).

**Local dev**

```bash
./local-run setup   # first time: Postgres, Python venv, migrations, npm deps
./local-run         # daily: start DB + Next.js dev server → http://localhost:3000/home
./local-run db      # Postgres only (no app)
./local-run migrate # apply Alembic migrations only
./local-run stop    # stop Postgres container
```

`requirements.txt` pins direct Python dependencies to versions verified by `./local-test python`. Re-run the full test suite after intentional upgrades.

Pipeline jobs: stuck `running` rows are reconciled after **1 hour** by default (`PIPELINE_JOB_STALE_HOURS`). Orphan jobs with no live server process are cleared after **5 minutes** (`PIPELINE_JOB_ORPHAN_MINUTES`). Increase `PIPELINE_JOB_STALE_HOURS` for crawls that routinely run longer than an hour.

**Tests**

```bash
./local-test              # before push: full CI parity (DB + pytest + web)
./local-test python       # backend: pytest (80% coverage) + browser pytest + CLI smoke
./local-test browser      # JS crawl integration tests (skips if Chromium unavailable)
./local-test web          # frontend: typecheck, lint, vitest
./local-test quick        # fast loop; needs DB already up (no coverage gate)
./local-test all --no-cov # full run without pytest coverage gate
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for setup and pull request guidelines.

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) — community standards
- [SECURITY.md](SECURITY.md) — report vulnerabilities privately

## Docs

- [AGENT.md](AGENT.md) — repo layout and dev commands
- [docs/GLOSSARY.md](docs/GLOSSARY.md) — UI terminology
- [docs/COMPANY_STANDARDS.md](docs/COMPANY_STANDARDS.md) — data and security policy

Google Search Console / Analytics: connect via **Integrations** (gear icon) in the app.

**JavaScript crawl (optional):** In Audit settings, set **Crawl rendering** to `javascript` (always headless Chromium) or `auto` (static first, browser when SPA heuristics match). Requires Playwright from `requirements.txt` and Chromium on `PATH` or `CHROME_PATH` (included in Docker). The UI preflights via `GET /api/crawl/browser-status` before runs when JS/auto is selected.

**AI Chat (optional):** Ask questions about your audit data at [http://localhost:3000/chat](http://localhost:3000/chat). Enable a provider under **Run audit → AI settings** (`llm_enabled`, provider, model). `./local-run setup` installs all Python deps from `requirements.txt` (including `httpx`, OpenAI, and Anthropic SDKs).

| Provider | Notes |
|----------|--------|
| **Ollama** | Local daemon at `http://127.0.0.1:11434`. Chat UI lists installed models plus the live Ollama cloud catalog (billing: free local, account free tier, Pro). Native tool calling when supported; otherwise ReAct fallback. Pick the model in-chat without leaving the page. |
| **OpenAI** / **Anthropic** | API key in AI settings; native tool calling with streaming. |

The agent uses the same **221 read-only audit tools** as the MCP server (`docs/MCP.md`). Responses stream over SSE (`POST /api/chat`) with status, tool activity, and tokens. Sessions are saved per property (`chat_sessions` / `chat_messages`).

Production: `docker-compose.prod.yml` (set `POSTGRES_PASSWORD`, `AUTH_SECRET`).



## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=codefrydev/WebsiteProfiling&type=Date)](https://star-history.com/#codefrydev/WebsiteProfiling&Date)

## License

Copyright (c) 2026 [codefrydev](https://github.com/codefrydev). Released under the **MIT License** — see [LICENSE](LICENSE). Issues and pull requests: [codefrydev/WebsiteProfiling](https://github.com/codefrydev/WebsiteProfiling).